﻿using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Console.Core;
using Console.Service.AI;
using Console.Service.Dto;
using Console.Service.Entities;
using Console.Service.Options;
using FastService;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace Console.Service.Services;

[FastService.Route("/v1/prompt")]
[Tags("提示词生成")]
public class PromptService(IDbContext dbContext, ILogger<PromptService> logger) : FastApi
{
    [EndpointSummary("自动生成提示词模板参数")]
    public async Task<PromptTemplateParameterDto> GeneratePromptTemplateParametersAsync(
        [FromBody] GeneratePromptTemplateParameterInput input, HttpContext context)
    {
        var token = context.Request.Headers["api-key"].ToString().Replace("Bearer ", "").Trim();

        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            throw new UnauthorizedAccessException("未授权访问，请提供有效的API令牌。");
        }

        var kernel = KernelFactory.CreateKernel(ConsoleOptions.DefaultChatModel, ConsoleOptions.OpenAIEndpoint, token);

        var plugins = await kernel.InvokeAsync(kernel.CreatePluginFromPromptDirectory(
                Path.Combine(AppContext.BaseDirectory, "plugins", "Generate"),
                "Generate")["GenerateDescription"],
            new KernelArguments(new OpenAIPromptExecutionSettings()
            {
                MaxTokens = 400,
                Temperature = 1
            })
            {
                ["prompt"] = input.Prompt
            });

        // 正则表达式提取<data>
        var regex = new Regex(@"<data>(.*?)<\/data>",
            RegexOptions.Singleline);
        var match = regex.Match(plugins.ToString());
        if (match.Success)
        {
            var dataContent = match.Groups[1].Value.Trim();
            var parameters =
                JsonSerializer.Deserialize<PromptTemplateParameterDto>(dataContent, JsonSerializerOptions.Web);

            if (parameters != null)
            {
                return parameters;
            }

            logger.LogWarning("从生成的提示词中提取的<data>标签内容无法反序列化为PromptTemplateParameterDto，请检查提示词格式: {Prompt}",
                input.Prompt);
        }
        else
        {
            logger.LogWarning("未能从生成的提示词中提取<data>标签内容，请检查提示词格式: {Prompt}", input.Prompt);
        }

        throw new Exception("无法从生成的提示词中提取参数，请检查提示词格式。");
    }

    [EndpointSummary("优化Function Calling提示词")]
    [HttpPost("optimize-function-calling")]
    public async Task OptimizeFunctionCallingPromptAsync(
        [FromBody] OptimizeFunctionCallingPromptInput input, HttpContext context)
    {
        var token = context.Request.Headers["api-key"].ToString().Replace("Bearer ", "").Trim();
        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            throw new UnauthorizedAccessException("未授权访问，请提供有效的API令牌。");
        }

        if (token.StartsWith("tk-"))
        {
            // 如果是sk 则是API Key
            var apiKey = await dbContext.ApiKeys
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Key == token);

            if (apiKey == null)
            {
                throw new InvalidOperationException("API Key not found.");
            }

            if (apiKey.ExpiresAt != null && apiKey.ExpiresAt < DateTime.Now)
            {
                throw new InvalidOperationException("API Key has expired.");
            }

            token = apiKey.OpenAiApiKey;
        }

        if (input.EnableDeepReasoning)
        {
            await DeepReasoningFunctionCallingAsync(input, context, token, ConsoleOptions.OpenAIEndpoint);
        }
        else
        {
            bool isFirst = true;

            var kernel =
                KernelFactory.CreateKernel(input.ChatModel, ConsoleOptions.OpenAIEndpoint, token, input.Language);

            var result = new StringBuilder();

            await foreach (var item in kernel.InvokeStreamingAsync(
                               kernel.Plugins["Generate"]["OptimizeInitialFunctionCallingPrompt"],
                               new KernelArguments(
                                   new OpenAIPromptExecutionSettings()
                                   {
                                       MaxTokens = 32000,
                                       Temperature = 0.7f,
                                   })
                               {
                                   { "function_call", input.Prompt },
                                   { "requirement", input.Requirements }
                               }))
            {
                if (isFirst)
                {
                    context.Response.Headers.ContentType = "text/event-stream";
                    context.Response.Headers.CacheControl = "no-cache";
                    context.Response.Headers.Connection = "keep-alive";

                    isFirst = false;
                }

                if (item is OpenAIStreamingChatMessageContent chatMessageContent)
                {
                    if (chatMessageContent.Content == null)
                    {
                        continue;
                    }

                    await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                    {
                        message = chatMessageContent.Content,
                        type = "message",
                    }, JsonSerializerOptions.Web)}\n\n");

                    result.Append(chatMessageContent.Content);

                    await context.Response.Body.FlushAsync();
                }
            }

            // 开始生成评估
            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                type = "evaluate-start",
            }, JsonSerializerOptions.Web)}\n\n");

            await foreach (var i in EvaluatePromptWordAsync(input.Prompt, result.ToString(), token,
                               ConsoleOptions.OpenAIEndpoint))
            {
                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = i,
                    type = "evaluate",
                }, JsonSerializerOptions.Web)}\n\n");
            }

            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                type = "evaluate-end",
            }, JsonSerializerOptions.Web)}\n\n");

            await context.Response.WriteAsync("data: [DONE]\n\n");
            await context.Response.Body.FlushAsync();

            var entity = new PromptHistory()
            {
                Id = Guid.NewGuid(),
                Requirement = input.Requirements ?? "",
                Result = result.ToString(),
                CreatedTime = DateTime.Now,
                DeepReasoning = "",
                Prompt = input.Prompt
            };

            await dbContext.PromptHistory.AddAsync(entity);

            if (token.StartsWith("tk-"))
            {
                await dbContext.ApiKeys
                    .Where(x => x.Key == token)
                    .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsageCount, a => a.UsageCount + 1)
                        .SetProperty(a => a.LastUsedTime, a => DateTime.Now));
            }

            await dbContext.SaveChangesAsync();
        }
    }


    [EndpointSummary("优化image提示词")]
    public async Task OptimizeImagePromptAsync(
        [FromBody] GenerateImagePromptInput input, HttpContext context)
    {
        var token = context.Request.Headers["api-key"].ToString().Replace("Bearer ", "").Trim();

        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            throw new UnauthorizedAccessException("未授权访问，请提供有效的API令牌。");
        }

        if (token.StartsWith("tk-"))
        {
            // 如果是sk 则是API Key
            var apiKey = await dbContext.ApiKeys
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Key == token);

            if (apiKey == null)
            {
                throw new InvalidOperationException("API Key not found.");
            }

            if (apiKey.ExpiresAt != null && apiKey.ExpiresAt < DateTime.Now)
            {
                throw new InvalidOperationException("API Key has expired.");
            }

            token = apiKey.OpenAiApiKey;
        }

        bool isFirst = true;

        var kernel = KernelFactory.CreateKernel(ConsoleOptions.DefaultImageGenerationModel,
            ConsoleOptions.OpenAIEndpoint, token);


        var result = new StringBuilder();

        await foreach (var item in kernel.InvokeStreamingAsync(kernel.Plugins["Generate"]["OptimizeImagePrompt"],
                           new KernelArguments(
                               new OpenAIPromptExecutionSettings()
                               {
                                   MaxTokens = 32000,
                                   Temperature = 0.7f,
                               })
                           {
                               { "prompt", input.Prompt },
                               { "requirement", input.Requirements }
                           }))
        {
            if (isFirst)
            {
                context.Response.Headers.ContentType = "text/event-stream";
                context.Response.Headers.CacheControl = "no-cache";
                context.Response.Headers.Connection = "keep-alive";

                isFirst = false;
            }

            if (item is OpenAIStreamingChatMessageContent chatMessageContent)
            {
                if (chatMessageContent.Content == null)
                {
                    continue;
                }

                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = chatMessageContent.Content,
                    type = "message",
                }, JsonSerializerOptions.Web)}\n\n");

                result.Append(chatMessageContent.Content);

                await context.Response.Body.FlushAsync();
            }
        }

        await context.Response.WriteAsync("data: [DONE]\n\n");

        await context.Response.Body.FlushAsync();

        var entity = new PromptHistory()
        {
            Id = Guid.NewGuid(),
            Requirement = input.Requirements ?? "",
            Result = result.ToString(),
            CreatedTime = DateTime.Now,
            DeepReasoning = "",
            Prompt = input.Prompt
        };

        await dbContext.PromptHistory.AddAsync(entity);

        if (token.StartsWith("tk-"))
        {
            await dbContext.ApiKeys
                .Where(x => x.Key == token)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsageCount, a => a.UsageCount + 1)
                    .SetProperty(a => a.LastUsedTime, a => DateTime.Now));
        }

        await dbContext.SaveChangesAsync();
    }

    private async Task DeepReasoningFunctionCallingAsync(OptimizeFunctionCallingPromptInput input, HttpContext context,
        string token,
        string apiUrl)
    {
        var kernel = KernelFactory.CreateKernel(input.ChatModel, apiUrl, token, input.Language);

        var isFirst = true;

        context.Response.Headers.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers.Connection = "keep-alive";


        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "deep-reasoning-start",
        }, JsonSerializerOptions.Web)}\n\n");

        var deepReasoning = new StringBuilder();

        await foreach (var item in kernel.InvokeStreamingAsync(
                           kernel.Plugins["Generate"]["DeepReasoningFunctionCalling"],
                           new KernelArguments(
                               new OpenAIPromptExecutionSettings()
                               {
                                   MaxTokens = 32000,
                                   Temperature = 0.7f,
                               })
                           {
                               { "date", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") },
                               { "function_call", input.Prompt },
                               { "requirement", input.Requirements }
                           }))
        {
            if (item is OpenAIStreamingChatMessageContent chatMessageContent)
            {
                if (chatMessageContent.Content == null)
                {
                    continue;
                }

                deepReasoning.Append(chatMessageContent.Content);

                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = chatMessageContent.Content,
                    type = "deep-reasoning",
                }, JsonSerializerOptions.Web)}\n\n");

                await context.Response.Body.FlushAsync();
            }
        }

        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "deep-reasoning-end",
        }, JsonSerializerOptions.Web)}\n\n");

        var result = new StringBuilder();

        await foreach (var item in kernel.InvokeStreamingAsync(
                           kernel.Plugins["Generate"]["DeepReasoningFunctionCallingPrompt"],
                           new KernelArguments(
                               new OpenAIPromptExecutionSettings()
                               {
                                   MaxTokens = 32000,
                                   Temperature = 0.7f,
                               })
                           {
                               { "function_call", input.Prompt },
                               { "requirement", input.Requirements },
                               { "deepReasoning", deepReasoning.ToString() }
                           }))
        {
            if (item is OpenAIStreamingChatMessageContent chatMessageContent)
            {
                if (chatMessageContent.Content == null)
                {
                    continue;
                }

                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = chatMessageContent.Content,
                    type = "message",
                }, JsonSerializerOptions.Web)}\n\n");

                result.Append(chatMessageContent.Content);

                await context.Response.Body.FlushAsync();
            }
        }

        // 开始生成评估
        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "evaluate-start",
        }, JsonSerializerOptions.Web)}\n\n");

        await foreach (var i in EvaluatePromptWordAsync(input.Prompt, result.ToString(), token,
                           ConsoleOptions.OpenAIEndpoint))
        {
            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                message = i,
                type = "evaluate",
            }, JsonSerializerOptions.Web)}\n\n");
        }

        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "evaluate-end",
        }, JsonSerializerOptions.Web)}\n\n");

        await context.Response.WriteAsync("data: [DONE]\n\n");
        await context.Response.Body.FlushAsync();

        var entity = new PromptHistory()
        {
            Id = Guid.NewGuid(),
            Requirement = input.Requirements ?? "",
            Result = result.ToString(),
            CreatedTime = DateTime.Now,
            DeepReasoning = deepReasoning.ToString(),
            Prompt = input.Prompt
        };

        await dbContext.PromptHistory.AddAsync(entity);

        if (token.StartsWith("tk-"))
        {
            await dbContext.ApiKeys
                .Where(x => x.Key == token)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsageCount, a => a.UsageCount + 1)
                    .SetProperty(a => a.LastUsedTime, a => DateTime.Now));
        }

        await dbContext.SaveChangesAsync();
    }

    [EndpointSummary("优化提示词")]
    [HttpPost("generate")]
    public async Task GeneratePromptAsync(GeneratePromptInput input, HttpContext context)
    {
        var token = context.Request.Headers["api-key"].ToString().Replace("Bearer ", "").Trim();

        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            return;
        }

        if (token.StartsWith("tk-"))
        {
            // 如果是sk 则是API Key
            var apiKey = await dbContext.ApiKeys
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Key == token);

            if (apiKey == null)
            {
                throw new InvalidOperationException("API Key not found.");
            }

            if (apiKey.ExpiresAt != null && apiKey.ExpiresAt < DateTime.Now)
            {
                throw new InvalidOperationException("API Key has expired.");
            }

            token = apiKey.OpenAiApiKey;
        }

        if (input.EnableDeepReasoning)
        {
            await DeepReasoningAsync(input, context, token, ConsoleOptions.OpenAIEndpoint);
        }
        else
        {
            bool isFirst = true;

            var kernel =
                KernelFactory.CreateKernel(input.ChatModel, ConsoleOptions.OpenAIEndpoint, token, input.Language);


            var result = new StringBuilder();

            await foreach (var item in kernel.InvokeStreamingAsync(kernel.Plugins["Generate"]["OptimizeInitialPrompt"],
                               new KernelArguments(
                                   new OpenAIPromptExecutionSettings()
                                   {
                                       MaxTokens = 32000,
                                       Temperature = 0.7f,
                                   })
                               {
                                   { "prompt", input.Prompt },
                                   { "requirement", input.Requirements }
                               }))
            {
                if (isFirst)
                {
                    context.Response.Headers.ContentType = "text/event-stream";
                    context.Response.Headers.CacheControl = "no-cache";
                    context.Response.Headers.Connection = "keep-alive";

                    isFirst = false;
                }

                if (item is OpenAIStreamingChatMessageContent chatMessageContent)
                {
                    if (chatMessageContent.Content == null)
                    {
                        continue;
                    }

                    await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                    {
                        message = chatMessageContent.Content,
                        type = "message",
                    }, JsonSerializerOptions.Web)}\n\n");

                    result.Append(chatMessageContent.Content);

                    await context.Response.Body.FlushAsync();
                }
            }

            // 开始生成评估
            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                type = "evaluate-start",
            }, JsonSerializerOptions.Web)}\n\n");

            await foreach (var i in EvaluatePromptWordAsync(input.Prompt, result.ToString(), token,
                               ConsoleOptions.OpenAIEndpoint))
            {
                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = i,
                    type = "evaluate",
                }, JsonSerializerOptions.Web)}\n\n");
            }


            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                type = "evaluate-end",
            }, JsonSerializerOptions.Web)}\n\n");

            await context.Response.WriteAsync("data: [DONE]\n\n");
            await context.Response.Body.FlushAsync();

            var entity = new PromptHistory()
            {
                Id = Guid.NewGuid(),
                Requirement = input.Requirements ?? "",
                Result = result.ToString(),
                CreatedTime = DateTime.Now,
                DeepReasoning = "",
                Prompt = input.Prompt
            };

            await dbContext.PromptHistory.AddAsync(entity);

            if (token.StartsWith("tk-"))
            {
                await dbContext.ApiKeys
                    .Where(x => x.Key == token)
                    .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsageCount, a => a.UsageCount + 1)
                        .SetProperty(a => a.LastUsedTime, a => DateTime.Now));
            }

            await dbContext.SaveChangesAsync();
        }
    }

    private async Task DeepReasoningAsync(GeneratePromptInput input, HttpContext context, string token, string apiUrl)
    {
        var kernel = KernelFactory.CreateKernel(input.ChatModel, apiUrl, token, input.Language);

        var isFirst = true;

        context.Response.Headers.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers.Connection = "keep-alive";


        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "deep-reasoning-start",
        }, JsonSerializerOptions.Web)}\n\n");

        var deepReasoning = new StringBuilder();

        try
        {
            await foreach (var item in kernel.InvokeStreamingAsync(kernel.Plugins["Generate"]["DeepReasoning"],
                               new KernelArguments(
                                   new OpenAIPromptExecutionSettings()
                                   {
                                       MaxTokens = 32000,
                                       Temperature = 0.7f,
                                   })
                               {
                                   { "date", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") },
                                   { "prompt", input.Prompt },
                                   { "requirement", input.Requirements }
                               }))
            {
                if (item is OpenAIStreamingChatMessageContent chatMessageContent)
                {
                    if (chatMessageContent.Content == null)
                    {
                        continue;
                    }

                    deepReasoning.Append(chatMessageContent.Content);

                    await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                    {
                        message = chatMessageContent.Content,
                        type = "deep-reasoning",
                    }, JsonSerializerOptions.Web)}\n\n");

                    await context.Response.Body.FlushAsync();
                }
            }
        }
        catch (Exception e)
        {
            logger.LogError(e, "Deep reasoning failed for prompt: {Prompt}", input.Prompt);
            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                error = e.Message,
                type = "error",
            }, JsonSerializerOptions.Web)}\n\n");
            await context.Response.Body.FlushAsync();
            return;
        }

        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "deep-reasoning-end",
        }, JsonSerializerOptions.Web)}\n\n");

        var result = new StringBuilder();

        // 正则表达式匹配<output>
        var regex = new Regex(@"<output>(.*?)<\/output>",
            RegexOptions.Singleline);

        var deepReasoningResult = deepReasoning.ToString();
        
        // 删除thought内容
        deepReasoningResult = Regex.Replace(deepReasoningResult, @"<thought>.*?<\/thought>", "", RegexOptions.Singleline);
        var match = regex.Match(deepReasoningResult);
        if (match.Success)
        {
            var outputContent = match.Groups[1].Value.Trim();
            deepReasoning.Clear();
            deepReasoning.Append(outputContent);
        }
        

        await foreach (var item in kernel.InvokeStreamingAsync(kernel.Plugins["Generate"]["DeepReasoningPrompt"],
                           new KernelArguments(
                               new OpenAIPromptExecutionSettings()
                               {
                                   MaxTokens = 32000,
                                   Temperature = 0.7f,
                               })
                           {
                               { "prompt", input.Prompt },
                               { "requirement", input.Requirements },
                               { "deepReasoning", deepReasoning.ToString() }
                           }))
        {
            if (item is OpenAIStreamingChatMessageContent chatMessageContent)
            {
                if (chatMessageContent.Content == null)
                {
                    continue;
                }

                deepReasoning.Append(chatMessageContent.Content);

                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
                {
                    message = chatMessageContent.Content,
                    type = "message",
                }, JsonSerializerOptions.Web)}\n\n");

                result.Append(chatMessageContent.Content);

                await context.Response.Body.FlushAsync();
            }
        }

        // 开始生成评估
        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "evaluate-start",
        }, JsonSerializerOptions.Web)}\n\n");

        await foreach (var i in EvaluatePromptWordAsync(input.Prompt, result.ToString(), token,
                           ConsoleOptions.OpenAIEndpoint))
        {
            await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
            {
                message = i,
                type = "evaluate",
            }, JsonSerializerOptions.Web)}\n\n");
        }

        await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(new
        {
            type = "evaluate-end",
        }, JsonSerializerOptions.Web)}\n\n");

        await context.Response.WriteAsync("data: [DONE]\n\n");
        await context.Response.Body.FlushAsync();

        var entity = new PromptHistory()
        {
            Id = Guid.NewGuid(),
            Requirement = input.Requirements ?? "",
            Result = result.ToString(),
            CreatedTime = DateTime.Now,
            DeepReasoning = deepReasoning.ToString(),
            Prompt = input.Prompt
        };

        await dbContext.PromptHistory.AddAsync(entity);

        await dbContext.SaveChangesAsync();
    }

    /// <summary>
    /// PromptWordEvaluation
    /// </summary>
    /// <returns></returns>
    private async IAsyncEnumerable<string> EvaluatePromptWordAsync(string prompt, string newPrompt, string token,
        string apiUrl)
    {
        var kernel = KernelFactory.CreateKernel(ConsoleOptions.DefaultChatModel, apiUrl, token);

        await foreach (var item in kernel.InvokeStreamingAsync(kernel.Plugins["Generate"]["PromptWordEvaluation"],
                           new KernelArguments(
                               new OpenAIPromptExecutionSettings()
                               {
                                   MaxTokens = 32000,
                                   Temperature = 0.7f,
                               })
                           {
                               { "prompt", prompt },
                               { "newPrompt", newPrompt }
                           }))
        {
            if (item is OpenAIStreamingChatMessageContent chatMessageContent)
            {
                if (chatMessageContent.Content == null)
                {
                    continue;
                }

                yield return chatMessageContent.Content;
            }
        }
    }
}