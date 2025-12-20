import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import useRealtimeSync from '../hooks/useRealtimeSync';
import EnhancedComposeModal from './EnhancedComposeModal';
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
  AlertCircle as ImportantIcon
} from 'lucide-react';

const GmailEmailClient = () => {
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmailView, setShowEmailView] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [composeData, setComposeData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    isDraft: false
  });
  const queryClient = useQueryClient();
  const refreshIntervalRef = useRef(null);
  const { startSync, stopSync, manualSync } = useRealtimeSync(30000); // 30 seconds

  // Fetch emails with real-time updates
  const { data: emails, isLoading, refetch } = useQuery(
    ['emails', selectedFolder, searchTerm, filterType, sortBy],
    async () => {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folder', selectedFolder);
      if (searchTerm) params.append('search', searchTerm);
      if (filterType !== 'all') params.append('filter', filterType);
      if (sortBy) params.append('sort', sortBy);
      
      const response = await axios.get(`/api/emails?${params.toString()}`);
      return response.data;
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      refetchOnWindowFocus: true,
    }
  );

  // Fetch clients for email composition
  const { data: clients } = useQuery('clients', async () => {
    const response = await axios.get('/api/clients');
    return response.data;
  });

  // Fetch email templates
  const { data: templates } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  // Fetch IMAP status
  const { data: imapStatus } = useQuery('imap-status', async () => {
    const response = await axios.get('/api/inbound/status');
    return response.data;
  }, {
    refetchInterval: 10000,
  });

  // Email mutations
  const updateEmailMutation = useMutation(async ({ id, data }) => {
    const response = await axios.put(`/api/emails/${id}`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      toast.success('Email updated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update email');
    }
  });

  const deleteEmailMutation = useMutation(async (id) => {
    const response = await axios.delete(`/api/emails/${id}`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      toast.success('Email deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete email');
    }
  });

  const sendEmailMutation = useMutation(async (emailData) => {
    const response = await axios.post('/api/emails', emailData);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      setShowCompose(false);
      setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', isDraft: false });
      toast.success('Email sent successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send email');
    }
  });

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await manualSync();
      await refetch();
      toast.success('Emails refreshed');
    } catch (error) {
      toast.error('Failed to refresh emails');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh setup
  useEffect(() => {
    if (imapStatus?.isPolling) {
      startSync();
    } else {
      stopSync();
    }

    return () => {
      stopSync();
    };
  }, [imapStatus?.isPolling, startSync, stopSync]);

  // Email selection handlers
  const handleSelectEmail = (emailId) => {
    setSelectedEmails(prev => 
      prev.includes(emailId) 
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmails.length === emails?.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(emails?.map(email => email.id) || []);
    }
  };

  // Email actions
  const handleMarkAsRead = (emailId) => {
    updateEmailMutation.mutate({ id: emailId, data: { isRead: true } });
  };

  const handleMarkAsUnread = (emailId) => {
    updateEmailMutation.mutate({ id: emailId, data: { isRead: false } });
  };

  const handleToggleImportant = (emailId) => {
    const email = emails?.find(e => e.id === emailId);
    updateEmailMutation.mutate({ 
      id: emailId, 
      data: { isImportant: !email?.isImportant } 
    });
  };

  const handleDeleteEmail = (emailId) => {
    deleteEmailMutation.mutate(emailId);
  };

  const handleArchiveEmail = (emailId) => {
    updateEmailMutation.mutate({ id: emailId, data: { isArchived: true } });
  };

  // Folder configuration
  const folders = [
    { id: 'inbox', name: 'Inbox', icon: Inbox, count: emails?.filter(e => !e.isSent && !e.isDraft).length || 0 },
    { id: 'sent', name: 'Sent', icon: Send, count: emails?.filter(e => e.isSent).length || 0 },
    { id: 'drafts', name: 'Drafts', icon: FileText, count: emails?.filter(e => e.isDraft).length || 0 },
    { id: 'important', name: 'Important', icon: Star, count: emails?.filter(e => e.isImportant).length || 0 },
    { id: 'trash', name: 'Trash', icon: TrashIcon, count: emails?.filter(e => e.isDeleted).length || 0 }
  ];

  // Filter options
  const filterOptions = [
    { id: 'all', name: 'All', icon: Mail },
    { id: 'unread', name: 'Unread', icon: MailOpen },
    { id: 'important', name: 'Important', icon: Star },
    { id: 'attachments', name: 'Has Attachments', icon: Paperclip },
    { id: 'today', name: 'Today', icon: Calendar },
    { id: 'thisweek', name: 'This Week', icon: Clock }
  ];

  // Sort options
  const sortOptions = [
    { id: 'date', name: 'Date' },
    { id: 'from', name: 'From' },
    { id: 'subject', name: 'Subject' },
    { id: 'size', name: 'Size' }
  ];

  const getStatusIcon = (email) => {
    if (email.isImportant) return <ImportantIcon className="h-4 w-4 text-yellow-500" />;
    if (email.attachments?.length > 0) return <Paperclip className="h-4 w-4 text-gray-500" />;
    if (!email.isRead) return <MailOpen className="h-4 w-4 text-blue-500" />;
    return <MailIcon className="h-4 w-4 text-gray-400" />;
  };

  const formatDate = (date) => {
    const now = new Date();
    const emailDate = new Date(date);
    const diffInHours = (now - emailDate) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return emailDate.toLocaleDateString([], { weekday: 'short' });
    } else {
      return emailDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-gray-900">Email Client</h1>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              imapStatus?.isPolling ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm text-gray-600">
              {imapStatus?.isPolling ? 'Syncing' : 'Offline'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="h-4 w-4" />
              <span className="text-sm">Filter</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {showFilters && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                {filterOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setFilterType(option.id);
                      setShowFilters(false);
                    }}
                    className={`w-full flex items-center space-x-2 px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                      filterType === option.id ? 'text-blue-600' : 'text-gray-700'
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                    <span>{option.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <span className="text-sm">Sort by {sortOptions.find(s => s.id === sortBy)?.name}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Compose Button */}
          <button
            onClick={() => setShowCompose(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Compose</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          {/* Folders */}
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
              Folders
            </h3>
            <nav className="space-y-1">
              {folders.map((folder) => {
                const Icon = folder.icon;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm rounded-lg ${
                      selectedFolder === folder.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="h-4 w-4" />
                      <span>{folder.name}</span>
                    </div>
                    {folder.count > 0 && (
                      <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded-full text-xs">
                        {folder.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* IMAP Status */}
          <div className="p-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
              IMAP Status
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Status</span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  imapStatus?.isPolling 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {imapStatus?.isPolling ? 'Active' : 'Stopped'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Connections</span>
                <span className="text-gray-900">{imapStatus?.totalConnections || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Email List Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleSelectAll}
                className="p-1 hover:bg-gray-100 rounded"
              >
                {selectedEmails.length === emails?.length ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4 text-gray-400" />
                )}
              </button>
              
              {selectedEmails.length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {selectedEmails.length} selected
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => selectedEmails.forEach(id => handleMarkAsRead(id))}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Mark as read"
                    >
                      <MailOpen className="h-4 w-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => selectedEmails.forEach(id => handleMarkAsUnread(id))}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Mark as unread"
                    >
                      <MailIcon className="h-4 w-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => selectedEmails.forEach(id => handleToggleImportant(id))}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Toggle important"
                    >
                      <StarIcon className="h-4 w-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => selectedEmails.forEach(id => handleDeleteEmail(id))}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="text-sm text-gray-600">
              {emails?.length || 0} emails
            </div>
          </div>

          {/* Email List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : emails?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Mail className="h-16 w-16 mb-4" />
                <p className="text-lg font-medium">No emails found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {emails?.map((email) => (
                  <div
                    key={email.id}
                    className={`flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                      selectedEmails.includes(email.id) ? 'bg-blue-50' : ''
                    } ${!email.isRead ? 'bg-blue-50' : ''}`}
                    onClick={() => {
                      setSelectedEmail(email);
                      setShowEmailView(true);
                      if (!email.isRead) {
                        handleMarkAsRead(email.id);
                      }
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEmail(email.id);
                      }}
                      className="mr-3 p-1 hover:bg-gray-200 rounded"
                    >
                      {selectedEmails.includes(email.id) ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    <div className="flex-1 flex items-center space-x-4 min-w-0">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(email)}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleImportant(email.id);
                          }}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <Star className={`h-4 w-4 ${
                            email.isImportant ? 'text-yellow-500 fill-current' : 'text-gray-400'
                          }`} />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${
                            !email.isRead ? 'text-gray-900' : 'text-gray-600'
                          }`}>
                            {email.from}
                          </span>
                          {email.attachments?.length > 0 && (
                            <Paperclip className="h-3 w-3 text-gray-400" />
                          )}
                        </div>
                        <p className={`text-sm truncate ${
                          !email.isRead ? 'text-gray-900 font-medium' : 'text-gray-600'
                        }`}>
                          {email.subject}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {email.bodyText?.substring(0, 100)}...
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">
                          {formatDate(email.receivedAt || email.sentAt)}
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEmail(email.id);
                          }}
                          className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email View Modal */}
      {showEmailView && selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedEmail.subject}
                </h3>
                <button
                  onClick={() => {
                    setShowEmailView(false);
                    setSelectedEmail(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="border-b border-gray-200 pb-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedEmail.from}</p>
                    <p className="text-sm text-gray-600">to {selectedEmail.to}</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(selectedEmail.receivedAt || selectedEmail.sentAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="prose max-w-none">
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.body }} />
              </div>

              {selectedEmail.attachments?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Attachments</h4>
                  <div className="space-y-2">
                    {selectedEmail.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                        <Paperclip className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{attachment.name}</span>
                        <span className="text-xs text-gray-500">({attachment.size} bytes)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowReply(true);
                    setShowEmailView(false);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Reply className="h-4 w-4" />
                  <span>Reply</span>
                </button>
                <button
                  onClick={() => {
                    setShowForward(true);
                    setShowEmailView(false);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Forward className="h-4 w-4" />
                  <span>Forward</span>
                </button>
                <button
                  onClick={() => {
                    handleDeleteEmail(selectedEmail.id);
                    setShowEmailView(false);
                    setSelectedEmail(null);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Compose Modal */}
      {showCompose && (
        <EnhancedComposeModal
          initialData={composeData}
          onSend={(data) => sendEmailMutation.mutate(data)}
          onClose={() => {
            setShowCompose(false);
            setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', isDraft: false });
          }}
          clients={clients || []}
          templates={templates || []}
        />
      )}
    </div>
  );
};

export default GmailEmailClient;