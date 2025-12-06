using System.ClientModel;
using System.Net.Http.Headers;
using Console.Service.Dto;
using OpenAI;

namespace Console.Service.Options;

public class ConsoleOptions
{
    public static string OpenAIEndpoint { get; set; }

    public static string[] ChatModel { get; set; }

    public static string[] ImageGenerationModel { get; set; }

    public static string DefaultChatModel { get; set; }

    /// <summary>
    /// 默认优化的图像生成模型
    /// </summary>
    public static string DefaultImageGenerationModel { get; set; }

    /// <summary>
    /// 用于评分模型的名称
    /// </summary>
    public static string ScoreModel { get; set; }

    /// <summary>
    /// 默认的API密钥
    /// </summary>
    public static string? DefaultAPIKey { get; set; } = null;

    public static async Task Initialize(IConfiguration configuration)
    {
        OpenAIEndpoint = configuration["OpenAIEndpoint"] ??
                         Environment.GetEnvironmentVariable("OpenAIEndpoint") ??
                         throw new ArgumentNullException("请配置环境变量：OpenAIEndpoint 示例：https://api.openai.com/v1");

        var chatModelStr = configuration.GetSection("CHAT_MODEL").Get<string>() ??
                           Environment.GetEnvironmentVariable("CHAT_MODEL");
        ChatModel = chatModelStr?.Split(',') ??
                    throw new ArgumentNullException("请配置环境变量：ChatModel 示例：gpt-4.1-mini,gpt-3.5-turbo");

        var imageModelStr = configuration.GetSection("IMAGE_GENERATION_MODEL").Get<string>() ??
                            Environment.GetEnvironmentVariable("IMAGE_GENERATION_MODEL");
        ImageGenerationModel = imageModelStr?.Split(',') ??
                               throw new ArgumentNullException("请配置环境变量：IMAGE_GENERATION_MODEL 示例：dall-e-3,midjourney");

        DefaultChatModel = configuration["DEFAULT_CHAT_MODEL"] ??
                          Environment.GetEnvironmentVariable("DEFAULT_CHAT_MODEL") ??
                          "gpt-4.1-mini";

        DefaultImageGenerationModel = configuration["DEFAULT_IMAGE_GENERATION_MODEL"] ??
                                      Environment.GetEnvironmentVariable("DEFAULT_IMAGE_GENERATION_MODEL") ??
                                      "o4-mini";

        ScoreModel = configuration["SCORE_MODEL"] ??
                     Environment.GetEnvironmentVariable("SCORE_MODEL") ??
                     "gpt-4.1";

        DefaultAPIKey = configuration["API_KEY"] ??
                        Environment.GetEnvironmentVariable("API_KEY");

        // 如果DefaultAPIKey和OpenAIEndpoint都配置了则自动获取模型列表
        if (!string.IsNullOrEmpty(DefaultAPIKey) && !string.IsNullOrEmpty(OpenAIEndpoint) &&
            DefaultChatModel.Length == 0)
        {
            using var client = new HttpClient();
            client.BaseAddress = new Uri(OpenAIEndpoint);
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", DefaultAPIKey);

            var response = await client.GetFromJsonAsync<ModelDto>("/models");


            if (response?.Data == null)
            {
                throw new Exception("无法获取模型列表，请检查API密钥和端点配置是否正确。");
            }

            ChatModel = response.Data.Select(x => x.Id).ToArray();
        }
    }
}