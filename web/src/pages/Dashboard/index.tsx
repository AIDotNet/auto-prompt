import React, { useState, useEffect, useCallback } from 'react';
import { 
  Button, 
  Input, 
  Typography, 
  Tag, 
  message,
  Spin,
  Empty,
  Tooltip,
  Pagination,
  Select,
  Space,
  Avatar,
  Segmented
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  HeartOutlined,
  HeartFilled,
  ShareAltOutlined,
  CopyOutlined,
  FireOutlined,
  TrophyOutlined,
  ReloadOutlined,
  UserOutlined,
  CalendarOutlined,
  TagOutlined,
  CloseOutlined,
  StarOutlined,
  StarFilled,
  MessageOutlined,
  SendOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../stores/themeStore';
import {
  searchSharedPromptTemplates,
  toggleLike,
  incrementView,
  getSharedPromptTemplate,
  toggleFavoriteShared,
  getComments,
  addComment,
  deleteComment
} from '../../api/promptTemplateApi';
import type {
  PromptTemplate,
  SharedPromptTemplateSearchInput,
  Comment,
  AddCommentInput
} from '../../api/promptTemplateApi';

const { Title, Text } = Typography;
const { Option } = Select;

const PageContainer = styled.div`
  padding: 24px;
  height: 100vh;
  overflow: hidden;
  background: ${props => props.theme === 'dark' ? '#0a0a0a' : '#f5f5f5'};
  display: flex;
  flex-direction: column;
`;

const PageHeader = styled.div`
  margin-bottom: 24px;
  flex-shrink: 0;
  
  .page-title {
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .page-description {
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    margin-bottom: 0;
  }
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  flex-shrink: 0;
  
  .search-section {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
    max-width: 600px;
  }
  
  .sort-section {
    display: flex;
    gap: 8px;
    align-items: center;
  }
`;

const ContentArea = styled.div`
  display: flex;
  gap: 24px;
  flex: 1;
  overflow: hidden;
`;

const LeftPanel = styled.div<{ showDetail?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
  min-width: 0;
`;

const LeftPanelContent = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  .ant-spin-container {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
`;

const SpinContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const RightPanel = styled.div<{ visible: boolean }>`
  width: ${props => props.visible ? '480px' : '0'};
  overflow: hidden;
  transition: all 0.3s ease;
  border-left: ${props => props.visible ? `1px solid ${props.theme === 'dark' ? '#424242' : '#e8e8e8'}` : 'none'};
  background: ${props => props.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
  border-radius: 12px;
`;

const ListContainer = styled.div`
  overflow-y: auto;
  background: ${props => props.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
  border-radius: 12px;
  border: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
  height: calc(100vh - 280px);
  max-height: calc(100vh - 280px);
`;

const CardGrid = styled.div<{ showDetail?: boolean }>`
  display: grid;
  grid-template-columns: ${props => props.showDetail 
    ? 'repeat(auto-fill, minmax(320px, 1fr))' 
    : 'repeat(auto-fill, minmax(400px, 1fr))'
  };
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
  height: calc(100vh - 280px);
  max-height: calc(100vh - 280px);
  background: ${props => props.theme === 'dark' ? '#0a0a0a' : '#f5f5f5'};
  border-radius: 12px;

  @media (max-width: 1400px) {
    grid-template-columns: ${props => props.showDetail 
      ? 'repeat(auto-fill, minmax(280px, 1fr))' 
      : 'repeat(auto-fill, minmax(350px, 1fr))'
    };
  }
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 16px;
  }
`;

const PromptCard = styled.div<{ selected?: boolean }>`
  background: ${props => props.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
  border: 1px solid ${props => props.selected 
    ? '#1677ff' 
    : (props.theme === 'dark' ? '#424242' : '#e8e8e8')
  };
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: ${props => props.selected 
    ? '0 4px 12px rgba(22, 119, 255, 0.15)' 
    : '0 2px 8px rgba(0, 0, 0, 0.06)'
  };
  height: fit-content;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    border-color: ${props => props.theme === 'dark' ? '#5a5a5a' : '#d0d0d0'};
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-shrink: 0;
`;

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  margin-right: 12px;
  
  .title-text {
    font-size: 18px;
    font-weight: 600;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  
  .action-btn {
    padding: 6px;
    border: none;
    background: transparent;
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    border-radius: 6px;
    transition: all 0.2s ease;
    
    &:hover {
      color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
      background: ${props => props.theme === 'dark' ? '#424242' : '#f0f0f0'};
    }
  }
`;

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
  font-size: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
`;

const CardDescription = styled.div`
  color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
  margin-bottom: 16px;
  font-size: 14px;
  line-height: 1.5;
  flex-shrink: 0;
`;

const CardContent = styled.div`
  background: ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'};
  border: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
  border-radius: 8px;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
  overflow: hidden;
  position: relative;
  margin-bottom: 16px;
  max-height: 220px;
  overflow-y: auto;
  
  /* 自定义滚动条 */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: ${props => props.theme === 'dark' ? '#1a1a1a' : '#f0f0f0'};
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme === 'dark' ? '#424242' : '#d0d0d0'};
    border-radius: 3px;
    
    &:hover {
      background: ${props => props.theme === 'dark' ? '#5a5a5a' : '#b0b0b0'};
    }
  }
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  
  .tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
    margin-right: 12px;
  }
  
  .stats {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    font-size: 12px;
    flex-shrink: 0;
    font-weight: 500;
  }
`;

const PromptListItem = styled.div<{ selected?: boolean }>`
  padding: 20px;
  border-bottom: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#f0f0f0'};
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.selected 
    ? (props.theme === 'dark' ? '#1677ff20' : '#e6f7ff') 
    : 'transparent'
  };
  border-left: ${props => props.selected ? '3px solid #1677ff' : '3px solid transparent'};
  
  &:hover {
    background: ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'};
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const PromptItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const PromptItemTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  
  .title-text {
    font-size: 18px;
    font-weight: 600;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    margin: 0;
    line-height: 1.3;
  }
`;

const PromptItemMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
  font-size: 12px;
  margin-bottom: 12px;
`;

const PromptItemActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.8;
  
  .action-btn {
    padding: 6px;
    border: none;
    background: transparent;
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    border-radius: 6px;
    
    &:hover {
      color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
      background: ${props => props.theme === 'dark' ? '#424242' : '#f0f0f0'};
    }
  }
`;

const PromptItemContent = styled.div`
  margin-bottom: 16px;
  
  .description {
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .content-preview {
    background: ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'};
    border: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
    border-radius: 8px;
    padding: 12px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    line-height: 1.5;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    max-height: 80px;
    overflow: hidden;
    position: relative;
    
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 20px;
      background: linear-gradient(transparent, ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'});
    }
  }
`;

const PromptItemFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  .tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
  }
  
  .stats {
    display: flex;
    align-items: center;
    gap: 16px;
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    font-size: 13px;
    font-weight: 500;
  }
`;

const HotBadge = styled.div`
  background: linear-gradient(45deg, #ff6b6b, #ffa500);
  color: white;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 3px;
`;

const DetailPanel = styled.div`
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const DetailHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  
  .close-btn {
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    
    &:hover {
      color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    }
  }
`;

const DetailContent = styled.div`
  flex: 1;
  
  .detail-title {
    font-size: 20px;
    font-weight: 600;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .detail-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    font-size: 14px;
  }
  
  .detail-description {
    color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
    margin-bottom: 16px;
    line-height: 1.6;
  }
  
  .detail-content {
    background: ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'};
    border: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
    white-space: pre-wrap;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .detail-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  
  .detail-stats {
    display: flex;
    gap: 24px;
    padding: 16px;
    background: ${props => props.theme === 'dark' ? '#262626' : '#f8f9fa'};
    border-radius: 8px;
    border: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
    margin-bottom: 16px;
  }
  
  .stat-item {
    text-align: center;
    
    .stat-value {
      font-size: 20px;
      font-weight: 600;
      color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
      display: block;
    }
    
    .stat-label {
      font-size: 12px;
      color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
      margin-top: 4px;
    }
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 16px;
  padding: 16px 0;
  flex-shrink: 0;
`;

const CommentsSection = styled.div`
  margin-top: 24px;
  border-top: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#e8e8e8'};
  padding-top: 20px;
  
  .comments-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 16px;
    font-weight: 600;
    color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
  }
  
  .comment-input {
    margin-bottom: 16px;
    
    .input-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
  }
  
  .comments-list {
    .comment-item {
      padding: 12px 0;
      border-bottom: 1px solid ${props => props.theme === 'dark' ? '#424242' : '#f0f0f0'};
      
      &:last-child {
        border-bottom: none;
      }
      
      .comment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        
        .comment-user {
          display: flex;
          align-items: center;
          gap: 8px;
          
          .user-name {
            font-weight: 500;
            color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
          }
          
          .comment-time {
            font-size: 12px;
            color: ${props => props.theme === 'dark' ? '#ffffff73' : '#00000073'};
          }
        }
        
        .comment-actions {
          display: flex;
          gap: 4px;
        }
      }
      
      .comment-content {
        color: ${props => props.theme === 'dark' ? '#ffffffd9' : '#000000d9'};
        line-height: 1.6;
        margin-bottom: 8px;
      }
    }
  }
  
  .comments-pagination {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }
`;

type ViewMode = 'list' | 'card';

const DashboardPage: React.FC = () => {
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('ViewCount');
  const [sortOrder, setSortOrder] = useState('desc');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsPagination, setCommentsPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // 加载分享的提示词列表
  const loadSharedPrompts = useCallback(async (page: number, search: string, sort: string, order: string) => {
    setLoading(true);
    try {
      const input: SharedPromptTemplateSearchInput = {
        searchText: search,
        page: page,
        pageSize: pagination.pageSize,
        sortBy: sort,
        sortOrder: order
      };

      const response = await searchSharedPromptTemplates(input);

      if (response.success) {
        setPrompts(response.data.items);
        setPagination(prev => ({
          ...prev,
          current: response.data.page,
          total: response.data.total
        }));
      } else {
        message.error(response.message || t('promptSquare.messages.loadFailed'));
      }
    } catch (error) {
      console.error('加载分享提示词失败:', error);
      message.error(t('promptSquare.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, t]);

  // 初始化加载
  useEffect(() => {
    loadSharedPrompts(1, '', 'ViewCount', 'desc');
  }, [loadSharedPrompts]);

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination(prev => ({ ...prev, current: 1 }));
    loadSharedPrompts(1, value, sortBy, sortOrder);
  };

  // 排序处理
  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
    setPagination(prev => ({ ...prev, current: 1 }));
    loadSharedPrompts(1, searchText, newSortBy, sortOrder);
  };

  // 排序顺序处理
  const handleSortOrderChange = (newSortOrder: string) => {
    setSortOrder(newSortOrder);
    setPagination(prev => ({ ...prev, current: 1 }));
    loadSharedPrompts(1, searchText, sortBy, newSortOrder);
  };

  // 视图模式切换处理
  const handleViewModeChange = (value: string | number) => {
    setViewMode(value as ViewMode);
  };

  // 分页处理
  const handlePageChange = (page: number, pageSize?: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || prev.pageSize }));
    loadSharedPrompts(page, searchText, sortBy, sortOrder);
  };

  // 加载评论
  const loadComments = async (promptId: string, page = 1) => {
    setCommentsLoading(true);
    try {
      const response = await getComments(promptId, page, commentsPagination.pageSize);
      if (response.success) {
        setComments(response.data.items);
        setCommentsPagination(prev => ({
          ...prev,
          current: response.data.page,
          total: response.data.total
        }));
      } else {
        message.error(response.message || t('promptSquare.messages.loadFailed'));
      }
    } catch (error) {
      console.error('加载评论失败:', error);
      message.error(t('promptSquare.messages.loadFailed'));
    } finally {
      setCommentsLoading(false);
    }
  };

  // 添加评论
  const handleAddComment = async () => {
    if (!selectedPrompt || !newComment.trim()) return;

    try {
      const input: AddCommentInput = {
        content: newComment.trim(),
        parentCommentId: replyingTo || undefined
      };

      const response = await addComment(selectedPrompt.id, input);
      if (response.success) {
        message.success(t('promptSquare.messages.commentSuccess'));
        setNewComment('');
        setReplyingTo(null);
        
        // 重新加载评论
        loadComments(selectedPrompt.id, commentsPagination.current);
        
        // 更新提示词的评论数
        setSelectedPrompt(prev => prev ? { ...prev, commentCount: prev.commentCount + 1 } : null);
        setPrompts(prev => prev.map(p => 
          p.id === selectedPrompt.id ? { ...p, commentCount: p.commentCount + 1 } : p
        ));
      } else {
        message.error(response.message || t('promptSquare.messages.operationFailed'));
      }
    } catch (error) {
      console.error('添加评论失败:', error);
      message.error(t('promptSquare.messages.operationFailed'));
    }
  };

  // 删除评论
  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await deleteComment(commentId);
      if (response.success) {
        message.success(t('promptSquare.messages.deleteSuccess'));
        
        // 重新加载评论
        if (selectedPrompt) {
          loadComments(selectedPrompt.id, commentsPagination.current);
          
          // 更新提示词的评论数
          setSelectedPrompt(prev => prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : null);
          setPrompts(prev => prev.map(p => 
            p.id === selectedPrompt.id ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p
          ));
        }
      } else {
        message.error(response.message || t('promptSquare.messages.operationFailed'));
      }
    } catch (error) {
      console.error('删除评论失败:', error);
      message.error(t('promptSquare.messages.operationFailed'));
    }
  };

  // 选择提示词
  const handleSelectPrompt = async (prompt: PromptTemplate) => {
    try {
      setLoading(true);
      
      // 获取完整的提示词详情
      const response = await getSharedPromptTemplate(prompt.id);
      if (response.success && response.data) {
        setSelectedPrompt(response.data);
        setShowDetail(true);
        
        // 加载评论
        loadComments(response.data.id);
        
        // 更新列表中的查看次数（API会自动增加查看次数）
        setPrompts(prev => prev.map(p => 
          p.id === prompt.id ? { ...p, viewCount: response.data?.viewCount || p.viewCount + 1 } : p
        ));
      } else {
        message.error(response.message || t('promptSquare.messages.loadFailed'));
        // 如果API调用失败，使用列表中的数据作为备选
        setSelectedPrompt(prompt);
        setShowDetail(true);
        loadComments(prompt.id);
      }
    } catch (error) {
      console.error('获取提示词详情失败:', error);
      message.error(t('promptSquare.messages.loadFailed'));
      // 如果API调用失败，使用列表中的数据作为备选
      setSelectedPrompt(prompt);
      setShowDetail(true);
      loadComments(prompt.id);
    } finally {
      setLoading(false);
    }
  };

  // 关闭详情面板
  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedPrompt(null);
  };

  // 点赞处理
  const handleToggleLike = async (prompt: PromptTemplate, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      const response = await toggleLike(prompt.id);
      if (response.success) {
        const newIsLiked = response.data?.isLiked || !prompt.isLikedByCurrentUser;
        const newLikeCount = response.data?.likeCount || prompt.likeCount;
        
        // 更新本地状态
        setPrompts(prev => prev.map(p => 
          p.id === prompt.id ? { 
            ...p, 
            likeCount: newLikeCount,
            isLikedByCurrentUser: newIsLiked
          } : p
        ));
        
        // 更新详情面板
        if (selectedPrompt?.id === prompt.id) {
          setSelectedPrompt(prev => prev ? {
            ...prev,
            likeCount: newLikeCount,
            isLikedByCurrentUser: newIsLiked
          } : null);
        }
        
        // 显示成功消息
        const messageKey = newIsLiked ? 'likeSuccess' : 'unlikeSuccess';
        message.success(t(`promptSquare.messages.${messageKey}`));
      } else {
        message.error(response.message || t('promptSquare.messages.operationFailed'));
      }
    } catch (error) {
      console.error('点赞操作失败:', error);
      message.error(t('promptSquare.messages.operationFailed'));
    }
  };

  // 复制提示词内容
  const handleCopyPrompt = async (prompt: PromptTemplate, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await navigator.clipboard.writeText(prompt.content);
      message.success(t('promptSquare.messages.copySuccess'));
      
      // 增加查看次数
      try {
        await incrementView(prompt.id);
        setPrompts(prev => prev.map(p => 
          p.id === prompt.id ? { ...p, viewCount: p.viewCount + 1 } : p
        ));
        // 更新详情面板
        if (selectedPrompt?.id === prompt.id) {
          setSelectedPrompt(prev => prev ? { ...prev, viewCount: prev.viewCount + 1 } : null);
        }
      } catch (error) {
        console.error('更新查看次数失败:', error);
      }
    } catch (error) {
      console.error('复制失败:', error);
      message.error(t('promptSquare.messages.copyFailed'));
    }
  };

  // 收藏处理
  const handleToggleFavorite = async (prompt: PromptTemplate, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      const response = await toggleFavoriteShared(prompt.id);
      if (response.success) {
        const newIsFavorited = response.data?.isFavorited || !prompt.isFavoritedByCurrentUser;
        
        // 更新本地状态
        setPrompts(prev => prev.map(p => 
          p.id === prompt.id ? { 
            ...p, 
            isFavoritedByCurrentUser: newIsFavorited
          } : p
        ));
        
        // 更新详情面板
        if (selectedPrompt?.id === prompt.id) {
          setSelectedPrompt(prev => prev ? {
            ...prev,
            isFavoritedByCurrentUser: newIsFavorited
          } : null);
        }
        
        // 显示成功消息
        const messageKey = newIsFavorited ? 'favoriteSuccess' : 'unfavoriteSuccess';
        message.success(t(`promptSquare.messages.${messageKey}`));
      } else {
        message.error(response.message || t('promptSquare.messages.operationFailed'));
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      message.error(t('promptSquare.messages.operationFailed'));
    }
  };

  // 判断是否为热门提示词
  const isHotPrompt = (prompt: PromptTemplate) => {
    return prompt.viewCount > 100 || prompt.likeCount > 20;
  };

  // 刷新数据
  const handleRefresh = () => {
    loadSharedPrompts(pagination.current, searchText, sortBy, sortOrder);
  };

  // 渲染卡片项
  const renderCardItem = (prompt: PromptTemplate) => (
    <PromptCard
      key={prompt.id}
      theme={theme}
      selected={selectedPrompt?.id === prompt.id}
      onClick={() => handleSelectPrompt(prompt)}
    >
      <CardHeader>
        <CardTitle theme={theme}>
          <span className="title-text">{prompt.title}</span>
          {isHotPrompt(prompt) && (
            <HotBadge>
              <FireOutlined />
              {t('promptSquare.hotBadge')}
            </HotBadge>
          )}
        </CardTitle>
        <CardActions theme={theme}>
          <Tooltip title={t('promptSquare.actions.copy')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={<CopyOutlined />}
              onClick={(e) => handleCopyPrompt(prompt, e)}
            />
          </Tooltip>
          <Tooltip title={prompt.isFavoritedByCurrentUser ? t('promptSquare.actions.unfavorite') : t('promptSquare.actions.favorite')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={prompt.isFavoritedByCurrentUser ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              onClick={(e) => handleToggleFavorite(prompt, e)}
            />
          </Tooltip>
          <Tooltip title={prompt.isLikedByCurrentUser ? t('promptSquare.actions.unlike') : t('promptSquare.actions.like')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={prompt.isLikedByCurrentUser ? <HeartFilled style={{ color: '#ff4d4f' }} /> : <HeartOutlined />}
              onClick={(e) => handleToggleLike(prompt, e)}
            />
          </Tooltip>
        </CardActions>
      </CardHeader>
      
      <CardMeta theme={theme}>
        <span><UserOutlined /> {prompt.creatorName || t('promptDetail.anonymousUser')}</span>
        <span><CalendarOutlined /> {new Date(prompt.shareTime || prompt.createdTime).toLocaleDateString()}</span>
      </CardMeta>
      
      {prompt.description && (
        <CardDescription theme={theme}>
          {prompt.description}
        </CardDescription>
      )}
      
      <CardContent theme={theme}>
        {prompt.content}
      </CardContent>
      
      <CardFooter theme={theme}>
        <div className="tags">
          {prompt.tags.slice(0, 4).map(tag => (
            <Tag key={tag} color="blue" style={{ margin: '2px 0' }}>
              {tag}
            </Tag>
          ))}
          {prompt.tags.length > 4 && (
            <Tag color="default" style={{ margin: '2px 0' }}>
              {t('promptSquare.tags.more', { count: prompt.tags.length - 4 })}
            </Tag>
          )}
        </div>
        <div className="stats">
          <span><EyeOutlined /> {prompt.viewCount}</span>
          <span><HeartOutlined /> {prompt.likeCount}</span>
          <span><MessageOutlined /> {prompt.commentCount}</span>
        </div>
      </CardFooter>
    </PromptCard>
  );

  // 渲染列表项
  const renderListItem = (prompt: PromptTemplate) => (
    <PromptListItem
      key={prompt.id}
      theme={theme}
      selected={selectedPrompt?.id === prompt.id}
      onClick={() => handleSelectPrompt(prompt)}
    >
      <PromptItemHeader>
        <PromptItemTitle theme={theme}>
          <span className="title-text">{prompt.title}</span>
          {isHotPrompt(prompt) && (
            <HotBadge>
              <FireOutlined />
              {t('promptSquare.hotBadge')}
            </HotBadge>
          )}
        </PromptItemTitle>
        <PromptItemActions theme={theme}>
          <Tooltip title={t('promptSquare.actions.copy')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={<CopyOutlined />}
              onClick={(e) => handleCopyPrompt(prompt, e)}
            />
          </Tooltip>
          <Tooltip title={prompt.isFavoritedByCurrentUser ? t('promptSquare.actions.unfavorite') : t('promptSquare.actions.favorite')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={prompt.isFavoritedByCurrentUser ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              onClick={(e) => handleToggleFavorite(prompt, e)}
            />
          </Tooltip>
          <Tooltip title={prompt.isLikedByCurrentUser ? t('promptSquare.actions.unlike') : t('promptSquare.actions.like')}>
            <Button
              type="text"
              size="small"
              className="action-btn"
              icon={prompt.isLikedByCurrentUser ? <HeartFilled style={{ color: '#ff4d4f' }} /> : <HeartOutlined />}
              onClick={(e) => handleToggleLike(prompt, e)}
            />
          </Tooltip>
        </PromptItemActions>
      </PromptItemHeader>
      
      <PromptItemMeta theme={theme}>
        <span><UserOutlined /> {prompt.creatorName || t('promptDetail.anonymousUser')}</span>
        <span><CalendarOutlined /> {new Date(prompt.shareTime || prompt.createdTime).toLocaleDateString()}</span>
      </PromptItemMeta>
      
      <PromptItemContent theme={theme}>
        {prompt.description && (
          <div className="description">{prompt.description}</div>
        )}
        <div className="content-preview">
          {prompt.content.length > 200 
            ? `${prompt.content.substring(0, 200)}...` 
            : prompt.content
          }
        </div>
      </PromptItemContent>
      
      <PromptItemFooter theme={theme}>
        <div className="tags">
          {prompt.tags.slice(0, 3).map(tag => (
            <Tag key={tag} color="blue">
              {tag}
            </Tag>
          ))}
          {prompt.tags.length > 3 && (
            <Tag color="default">
              {t('promptSquare.tags.more', { count: prompt.tags.length - 3 })}
            </Tag>
          )}
        </div>
        <div className="stats">
          <span><EyeOutlined /> {prompt.viewCount}</span>
          <span><HeartOutlined /> {prompt.likeCount}</span>
          <span><MessageOutlined /> {prompt.commentCount}</span>
          <span><ShareAltOutlined /> {prompt.usageCount}</span>
        </div>
      </PromptItemFooter>
    </PromptListItem>
  );

  return (
    <PageContainer theme={theme}>
      <PageHeader theme={theme}>
        <Title level={2} className="page-title">
          <TrophyOutlined style={{ color: '#ffa500' }} />
          {t('promptSquare.title')}
        </Title>
        <Text className="page-description">
          {t('promptSquare.description')}
        </Text>
      </PageHeader>

      <ActionBar>
        <div className="search-section">
          <Input.Search
            placeholder={t('promptSquare.searchPlaceholder')}
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ maxWidth: 400 }}
          />
        </div>
        
        <div className="sort-section">
          <Segmented
            value={viewMode}
            onChange={handleViewModeChange}
            options={[
              { 
                label: (
                  <Tooltip title={t('promptSquare.view.list')}>
                    <UnorderedListOutlined />
                  </Tooltip>
                ), 
                value: 'list' 
              },
              { 
                label: (
                  <Tooltip title={t('promptSquare.view.card')}>
                    <AppstoreOutlined />
                  </Tooltip>
                ), 
                value: 'card' 
              }
            ]}
          />
          
          <Text type="secondary">{t('promptSquare.sortBy')}</Text>
          <Select
            value={sortBy}
            onChange={handleSortChange}
            style={{ width: 120 }}
          >
            <Option value="ViewCount">{t('promptSquare.sortOptions.viewCount')}</Option>
            <Option value="LikeCount">{t('promptSquare.sortOptions.likeCount')}</Option>
            <Option value="ShareTime">{t('promptSquare.sortOptions.shareTime')}</Option>
            <Option value="CreatedTime">{t('promptSquare.sortOptions.createdTime')}</Option>
          </Select>
          
          <Select
            value={sortOrder}
            onChange={handleSortOrderChange}
            style={{ width: 80 }}
          >
            <Option value="desc">{t('promptSquare.sortOrder.desc')}</Option>
            <Option value="asc">{t('promptSquare.sortOrder.asc')}</Option>
          </Select>
          
          <Tooltip title={t('promptSquare.refresh')}>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={handleRefresh}
              loading={loading}
            />
          </Tooltip>
        </div>
      </ActionBar>

      <ContentArea>
        <LeftPanel showDetail={showDetail}>
          <LeftPanelContent>
            <Spin spinning={loading} style={{ height: '100%' }}>
              {prompts.length === 0 && !loading ? (
                <Empty 
                  description={t('promptSquare.empty')}
                  style={{ marginTop: 60 }}
                />
              ) : (
                <>
                  <SpinContainer>
                    {viewMode === 'card' ? (
                      <CardGrid theme={theme} showDetail={showDetail}>
                        {prompts.map(renderCardItem)}
                      </CardGrid>
                    ) : (
                      <ListContainer theme={theme}>
                        {prompts.map(renderListItem)}
                      </ListContainer>
                    )}
                  </SpinContainer>

                  {pagination.total > pagination.pageSize && (
                    <PaginationContainer>
                      <Pagination
                        current={pagination.current}
                        total={pagination.total}
                        pageSize={pagination.pageSize}
                        showSizeChanger
                        showQuickJumper
                        showTotal={(total, range) => t('promptSquare.pagination', { 
                          start: range[0], 
                          end: range[1], 
                          total 
                        })}
                        onChange={handlePageChange}
                        onShowSizeChange={handlePageChange}
                        pageSizeOptions={['20', '40', '60', '100']}
                        size="small"
                      />
                    </PaginationContainer>
                  )}
                </>
              )}
            </Spin>
          </LeftPanelContent>
        </LeftPanel>

        <RightPanel visible={showDetail} theme={theme}>
          {selectedPrompt && (
            <DetailPanel>
              <DetailHeader theme={theme}>
                <Title level={4} style={{ margin: 0 }}>
                  {t('promptDetail.title')}
                </Title>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={handleCloseDetail}
                  className="close-btn"
                />
              </DetailHeader>
              
              <DetailContent theme={theme}>
                <div className="detail-title">
                  {selectedPrompt.title}
                  {isHotPrompt(selectedPrompt) && (
                    <HotBadge>
                      <FireOutlined />
                      {t('promptSquare.hotBadge')}
                    </HotBadge>
                  )}
                </div>
                
                <div className="detail-meta">
                  <span><UserOutlined /> {selectedPrompt.creatorName || t('promptDetail.anonymousUser')}</span>
                  <span><CalendarOutlined /> {new Date(selectedPrompt.shareTime || selectedPrompt.createdTime).toLocaleDateString()}</span>
                </div>
                
                {selectedPrompt.description && (
                  <div className="detail-description">
                    {selectedPrompt.description}
                  </div>
                )}
                
                <div className="detail-content">
                  {selectedPrompt.content}
                </div>
                
                <div className="detail-stats">
                  <div className="stat-item">
                    <span className="stat-value">{selectedPrompt.viewCount}</span>
                    <div className="stat-label">{t('promptDetail.viewCount')}</div>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{selectedPrompt.likeCount}</span>
                    <div className="stat-label">{t('promptDetail.likeCount')}</div>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{selectedPrompt.commentCount}</span>
                    <div className="stat-label">{t('promptDetail.commentCount')}</div>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{selectedPrompt.usageCount}</span>
                    <div className="stat-label">{t('promptDetail.usageCount')}</div>
                  </div>
                </div>
                
                <div className="detail-actions">
                  <Button
                    type="primary"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyPrompt(selectedPrompt)}
                  >
                    {t('promptDetail.copyContent')}
                  </Button>
                  <Button
                    icon={selectedPrompt.isFavoritedByCurrentUser ? <StarFilled /> : <StarOutlined />}
                    onClick={() => handleToggleFavorite(selectedPrompt)}
                    style={{ 
                      color: selectedPrompt.isFavoritedByCurrentUser ? '#faad14' : undefined 
                    }}
                  >
                    {selectedPrompt.isFavoritedByCurrentUser ? t('promptDetail.favorited') : t('promptDetail.favorite')}
                  </Button>
                  <Button
                    icon={selectedPrompt.isLikedByCurrentUser ? <HeartFilled /> : <HeartOutlined />}
                    onClick={() => handleToggleLike(selectedPrompt)}
                    style={{ 
                      color: selectedPrompt.isLikedByCurrentUser ? '#ff4d4f' : undefined 
                    }}
                  >
                    {selectedPrompt.isLikedByCurrentUser ? t('promptDetail.liked') : t('promptDetail.like')} ({selectedPrompt.likeCount})
                  </Button>
                </div>
                
                {selectedPrompt.tags.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ marginRight: 8 }}>
                      <TagOutlined /> {t('prompts.tags')}:
                    </Text>
                    <Space wrap>
                      {selectedPrompt.tags.map(tag => (
                        <Tag key={tag} color="blue">{tag}</Tag>
                      ))}
                    </Space>
                  </div>
                )}

                {/* 评论区 */}
                <CommentsSection theme={theme}>
                  <div className="comments-header">
                    <MessageOutlined />
                    {t('promptDetail.comments')} ({selectedPrompt.commentCount})
                  </div>
                  
                  {/* 评论输入框 */}
                  <div className="comment-input">
                    <Input.TextArea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={replyingTo ? t('promptDetail.replyPlaceholder') : t('promptDetail.commentPlaceholder')}
                      rows={3}
                      maxLength={2000}
                    />
                    <div className="input-actions">
                      {replyingTo && (
                        <Button size="small" onClick={() => setReplyingTo(null)}>
                          {t('promptDetail.cancelReply')}
                        </Button>
                      )}
                      <Button
                        type="primary"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                      >
                        {t('promptDetail.submitComment')}
                      </Button>
                    </div>
                  </div>

                  {/* 评论列表 */}
                  <Spin spinning={commentsLoading}>
                    <div className="comments-list">
                      {comments.length === 0 ? (
                        <Empty 
                          description={t('promptDetail.noComments')}
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                      ) : (
                        comments.map(comment => (
                          <div key={comment.id} className="comment-item">
                            <div className="comment-header">
                              <div className="comment-user">
                                <Avatar size="small" icon={<UserOutlined />} />
                                <span className="user-name">{comment.userName}</span>
                                <span className="comment-time">
                                  {new Date(comment.createdTime).toLocaleString()}
                                </span>
                              </div>
                              <div className="comment-actions">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleDeleteComment(comment.id)}
                                  style={{ color: '#ff4d4f' }}
                                >
                                  {t('promptDetail.deleteComment')}
                                </Button>
                              </div>
                            </div>
                            <div className="comment-content">
                              {comment.content}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Spin>

                  {/* 评论分页 */}
                  {commentsPagination.total > commentsPagination.pageSize && (
                    <div className="comments-pagination">
                      <Pagination
                        current={commentsPagination.current}
                        total={commentsPagination.total}
                        pageSize={commentsPagination.pageSize}
                        showSizeChanger={false}
                        showQuickJumper={false}
                        size="small"
                        onChange={(page) => loadComments(selectedPrompt.id, page)}
                      />
                    </div>
                  )}
                </CommentsSection>
              </DetailContent>
            </DetailPanel>
          )}
        </RightPanel>
      </ContentArea>
    </PageContainer>
  );
};

export default DashboardPage; 