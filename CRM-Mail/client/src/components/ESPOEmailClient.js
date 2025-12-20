import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail,
  Inbox,
  Send,
  FileText,
  Star,
  Search,
  Plus,
  Reply,
  Forward,
  Trash2,
  Archive,
  MoreVertical,
  Paperclip,
  Eye,
  EyeOff,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  Move,
  Tag,
  Settings,
  MoreHorizontal,
  Calendar,
  User,
  MailOpen,
  Mail as MailIcon,
  Send as SendIcon,
  Star as StarIcon,
  Archive as ArchiveIcon,
  Trash2 as TrashIcon,
  AlertCircle as ImportantIcon,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronUp,
  Grid,
  List,
  SortAsc,
  SortDesc,
  Filter as FilterIcon,
  X,
  Edit3,
  Copy,
  Share,
  Bookmark,
  BookmarkCheck,
  Flag,
  FlagOff,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  Zap,
  ZapOff,
  Heart,
  HeartOff,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  MessageCircle,
  Phone,
  Video,
  Camera,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Battery,
  BatteryLow,
  Sun,
  Moon,
  Cloud,
  CloudOff,
  CloudRain,
  CloudSnow,
  Wind,
  Droplets,
  Thermometer,
  Gauge,
  Activity,
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Trophy,
  Medal,
  Crown,
  Gem,
  Sparkles,
  Star as SparkleIcon,
  Zap as LightningIcon,
  Flame,
  Snowflake,
  Sun as SunIcon,
  Moon as MoonIcon,
  Cloud as CloudIcon,
  CloudRain as RainIcon,
  CloudSnow as SnowIcon,
  Wind as WindIcon,
  Droplets as DropletIcon,
  Thermometer as ThermometerIcon,
  Gauge as GaugeIcon,
  Activity as ActivityIcon,
  BarChart3 as BarChartIcon,
  PieChart as PieChartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Target as TargetIcon,
  Award as AwardIcon,
  Trophy as TrophyIcon,
  Medal as MedalIcon,
  Crown as CrownIcon,
  Gem as GemIcon
} from 'lucide-react';

const ESPOEmailClient = () => {
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState('list'); // list, grid
  const [showCompose, setShowCompose] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showEmailDetails, setShowEmailDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [composeData, setComposeData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
    parentId: '',
    parentType: 'account',
    templateId: ''
  });

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const isCeo = (user?.role || '').toLowerCase() === 'ceo';

  // Fetch emails
  const { data: emails = [], isLoading: emailsLoading, refetch: refetchEmails } = useQuery(
    ['emails', selectedFolder, searchTerm, filterType, sortBy, sortOrder],
    async () => {
      const params = new URLSearchParams({
        folder: selectedFolder,
        search: searchTerm,
        filter: filterType,
        sortBy,
        sortOrder
      });
      const response = await axios.get(`/api/emails?${params}`);
      return response.data;
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      refetchOnWindowFocus: true
    }
  );

  // Fetch email accounts
  const { data: emailAccounts = [] } = useQuery('email-accounts', async () => {
    const response = await axios.get('/api/email-accounts');
    return response.data;
  });

  const groupedEmailAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(emailAccounts) ? emailAccounts : [];
    const shared = accountsArray.filter(account => account.isSystemAccount);
    const mine = accountsArray.filter(account => !account.isSystemAccount && account.ownerId === currentUserId);
    const others = accountsArray.filter(account => !account.isSystemAccount && account.ownerId && account.ownerId !== currentUserId);
    return { shared, mine, others };
  }, [emailAccounts, currentUserId]);

  // Fetch folders
  const { data: folders = [] } = useQuery('email-folders', async () => {
    const response = await axios.get('/api/email-folders');
    return response.data;
  });

  // Fetch clients for parent linking
  const { data: clients = [] } = useQuery('clients', async () => {
    const response = await axios.get('/api/clients');
    return response.data;
  });

  // Fetch templates
  const { data: templates = [] } = useQuery('email-templates', async () => {
    const response = await axios.get('/api/email-templates');
    return response.data;
  });

  // Mutations
  const markAsReadMutation = useMutation(
    async (emailIds) => {
      await axios.put('/api/emails/mark-read', { emailIds });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('emails');
        toast.success('Emails marked as read');
      }
    }
  );

  const markAsUnreadMutation = useMutation(
    async (emailIds) => {
      await axios.put('/api/emails/mark-unread', { emailIds });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('emails');
        toast.success('Emails marked as unread');
      }
    }
  );

  const deleteEmailsMutation = useMutation(
    async (emailIds) => {
      await axios.delete('/api/emails', { data: { emailIds } });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('emails');
        setSelectedEmails([]);
        toast.success('Emails deleted');
      }
    }
  );

  const sendEmailMutation = useMutation(
    async (emailData) => {
      const response = await axios.post('/api/emails/send', emailData);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('emails');
        setShowCompose(false);
        setComposeData({
          to: '',
          cc: '',
          bcc: '',
          subject: '',
          body: '',
          attachments: [],
          parentId: '',
          parentType: 'account',
          templateId: ''
        });
        toast.success('Email sent successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to send email');
      }
    }
  );

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchEmails();
      toast.success('Emails refreshed');
    } catch (error) {
      toast.error('Failed to refresh emails');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle email selection
  const handleEmailSelect = (emailId) => {
    setSelectedEmails(prev => 
      prev.includes(emailId) 
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedEmails.length === emails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(emails.map(email => email.id));
    }
  };

  // Handle email click
  const handleEmailClick = (email) => {
    setSelectedEmail(email);
    setShowEmailDetails(true);
    
    // Mark as read if not already
    if (!email.isRead) {
      markAsReadMutation.mutate([email.id]);
    }
  };

  // Handle compose
  const handleCompose = (replyTo = null) => {
    if (replyTo) {
      setComposeData({
        to: replyTo.from,
        cc: '',
        bcc: '',
        subject: `Re: ${replyTo.subject}`,
        body: `\n\n--- Original Message ---\nFrom: ${replyTo.from}\nDate: ${new Date(replyTo.date).toLocaleString()}\nSubject: ${replyTo.subject}\n\n${replyTo.body}`,
        attachments: [],
        parentId: replyTo.parentId || '',
        parentType: replyTo.parentType || 'account',
        templateId: ''
      });
    }
    setShowCompose(true);
  };

  // Handle send email
  const handleSendEmail = () => {
    if (!composeData.to || !composeData.subject) {
      toast.error('Please fill in required fields');
      return;
    }
    sendEmailMutation.mutate(composeData);
  };

  // Get folder counts
  const getFolderCount = (folderType) => {
    return emails.filter(email => email.folder === folderType).length;
  };

  // Get unread count
  const getUnreadCount = (folderType) => {
    return emails.filter(email => email.folder === folderType && !email.isRead).length;
  };

  // Format date
  const formatDate = (date) => {
    const now = new Date();
    const emailDate = new Date(date);
    const diffInHours = (now - emailDate) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return emailDate.toLocaleDateString();
    }
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'normal': return 'text-blue-600 bg-blue-50';
      case 'low': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'delivered': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'opened': return <Eye className="h-4 w-4 text-purple-500" />;
      case 'clicked': return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'bounced': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-64' : 'w-16'} bg-white border-r border-gray-200 transition-all duration-300`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className={`text-xl font-bold text-gray-900 ${!showSidebar && 'hidden'}`}>
              STIGNITE
            </h1>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              {showSidebar ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'inbox' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <Inbox className="h-5 w-5 mr-3" />
              {showSidebar && <span>Inbox ({getUnreadCount('inbox')})</span>}
            </div>
            
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'sent' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <Send className="h-5 w-5 mr-3" />
              {showSidebar && <span>Sent ({getFolderCount('sent')})</span>}
            </div>
            
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'drafts' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <FileText className="h-5 w-5 mr-3" />
              {showSidebar && <span>Drafts ({getFolderCount('drafts')})</span>}
            </div>
            
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'important' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <Star className="h-5 w-5 mr-3" />
              {showSidebar && <span>Important ({getFolderCount('important')})</span>}
            </div>
            
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'archive' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <Archive className="h-5 w-5 mr-3" />
              {showSidebar && <span>Archive ({getFolderCount('archive')})</span>}
            </div>
            
            <div className={`flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 ${selectedFolder === 'trash' ? 'bg-blue-50 text-blue-700' : ''}`}>
              <Trash2 className="h-5 w-5 mr-3" />
              {showSidebar && <span>Trash ({getFolderCount('trash')})</span>}
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-gray-900">Emails</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleCompose()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Compose</span>
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search emails..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {showFilters && (
              <div className="flex items-center space-x-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="important">Important</option>
                  <option value="starred">Starred</option>
                  <option value="attachments">With Attachments</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="date">Date</option>
                  <option value="from">From</option>
                  <option value="subject">Subject</option>
                  <option value="size">Size</option>
                </select>
                
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  {sortOrder === 'asc' ? <SortAsc className="h-5 w-5" /> : <SortDesc className="h-5 w-5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Email List */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex">
            {/* Email List */}
            <div className="flex-1 bg-white border-r border-gray-200 overflow-y-auto">
              {/* Email List Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleSelectAll}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {selectedEmails.length === emails.length ? 
                        <CheckSquare className="h-5 w-5 text-blue-600" /> : 
                        <Square className="h-5 w-5 text-gray-400" />
                      }
                    </button>
                    <span className="text-sm text-gray-600">
                      {selectedEmails.length > 0 ? `${selectedEmails.length} selected` : `${emails.length} emails`}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {selectedEmails.length > 0 && (
                      <>
                        <button
                          onClick={() => markAsReadMutation.mutate(selectedEmails)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          title="Mark as read"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => markAsUnreadMutation.mutate(selectedEmails)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          title="Mark as unread"
                        >
                          <EyeOff className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteEmailsMutation.mutate(selectedEmails)}
                          className="p-2 hover:bg-gray-100 rounded-lg text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Email Items */}
              <div className="divide-y divide-gray-200">
                {emailsLoading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading emails...</p>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-8 text-center">
                    <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No emails found</p>
                  </div>
                ) : (
                  emails.map((email) => (
                    <div
                      key={email.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer ${
                        selectedEmails.includes(email.id) ? 'bg-blue-50' : ''
                      } ${!email.isRead ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                      onClick={() => handleEmailClick(email)}
                    >
                      <div className="flex items-start space-x-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmailSelect(email.id);
                          }}
                          className="mt-1"
                        >
                          {selectedEmails.includes(email.id) ? 
                            <CheckSquare className="h-4 w-4 text-blue-600" /> : 
                            <Square className="h-4 w-4 text-gray-400" />
                          }
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <p className={`text-sm font-medium ${!email.isRead ? 'font-bold' : ''}`}>
                                {email.fromName || email.from}
                              </p>
                              {email.isImportant && <ImportantIcon className="h-4 w-4 text-red-500" />}
                              {email.isStarred && <StarIcon className="h-4 w-4 text-yellow-500" />}
                              {email.hasAttachments && <Paperclip className="h-4 w-4 text-gray-400" />}
                            </div>
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(email.status)}
                              <span className="text-xs text-gray-500">
                                {formatDate(email.date)}
                              </span>
                            </div>
                          </div>
                          
                          <p className={`text-sm text-gray-900 mt-1 ${!email.isRead ? 'font-bold' : ''}`}>
                            {email.subject || '(No Subject)'}
                          </p>
                          
                          <p className="text-sm text-gray-600 mt-1 truncate">
                            {email.bodyText || email.body || 'No preview available'}
                          </p>
                          
                          <div className="flex items-center space-x-2 mt-2">
                            {email.priority && (
                              <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(email.priority)}`}>
                                {email.priority}
                              </span>
                            )}
                            {email.parentType && (
                              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                {email.parentType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Email Details Panel */}
            {showEmailDetails && selectedEmail && (
              <div className="w-1/2 bg-white border-l border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{selectedEmail.subject || '(No Subject)'}</h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleCompose(selectedEmail)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Reply"
                      >
                        <Reply className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setShowEmailDetails(false)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600">From: {selectedEmail.fromName || selectedEmail.from}</p>
                      <p className="text-sm text-gray-600">To: {selectedEmail.toName || selectedEmail.to}</p>
                      <p className="text-sm text-gray-600">Date: {new Date(selectedEmail.date).toLocaleString()}</p>
                    </div>
                    
                    <div className="prose max-w-none">
                      {selectedEmail.bodyHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                      ) : (
                        <pre className="whitespace-pre-wrap">{selectedEmail.bodyText || selectedEmail.body}</pre>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-5/6 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Compose Email</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSendEmail}
                    disabled={sendEmailMutation.isLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sendEmailMutation.isLoading ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={() => setShowCompose(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From *</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      {[
                        { label: 'Shared (System)', accounts: groupedEmailAccounts.shared },
                        { label: 'My Accounts', accounts: groupedEmailAccounts.mine },
                        ...(isCeo ? [{ label: 'Team Accounts', accounts: groupedEmailAccounts.others }] : [])
                      ].map((section) =>
                        section.accounts.length > 0 ? (
                          <optgroup key={section.label} label={section.label}>
                            {section.accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name} ({account.email}){account.isActive === false ? ' (Paused)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ) : null
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
                    <input
                      type="email"
                      value={composeData.to}
                      onChange={(e) => setComposeData({...composeData, to: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="recipient@example.com"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                    <input
                      type="email"
                      value={composeData.cc}
                      onChange={(e) => setComposeData({...composeData, cc: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="cc@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">BCC</label>
                    <input
                      type="email"
                      value={composeData.bcc}
                      onChange={(e) => setComposeData({...composeData, bcc: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="bcc@example.com"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                  <input
                    type="text"
                    value={composeData.subject}
                    onChange={(e) => setComposeData({...composeData, subject: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Email subject"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                  <textarea
                    value={composeData.body}
                    onChange={(e) => setComposeData({...composeData, body: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={10}
                    placeholder="Email body..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ESPOEmailClient;
