import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
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
  EyeOff
} from 'lucide-react';
import { Dialog, Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';

const EmailClient = () => {
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmailView, setShowEmailView] = useState(false);
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery(
    ['emails', selectedFolder, searchTerm],
    async () => {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folder', selectedFolder);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await axios.get(`/api/emails?${params.toString()}`);
      return response.data;
    }
  );

  const { data: clients } = useQuery('clients', async () => {
    const response = await axios.get('/api/clients');
    return response.data;
  });

  const { data: templates } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  const sendEmailMutation = useMutation(async (emailData) => {
    const response = await axios.post('/api/emails', emailData);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      setShowCompose(false);
      toast.success('Email sent successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send email');
    }
  });

  const replyEmailMutation = useMutation(async ({ emailId, data }) => {
    const response = await axios.post(`/api/emails/${emailId}/reply`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      setShowReply(false);
      setSelectedEmail(null);
      toast.success('Reply sent successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send reply');
    }
  });

  const forwardEmailMutation = useMutation(async ({ emailId, data }) => {
    const response = await axios.post(`/api/emails/${emailId}/forward`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      setShowForward(false);
      setSelectedEmail(null);
      toast.success('Email forwarded successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to forward email');
    }
  });

  const deleteEmailMutation = useMutation(async (emailId) => {
    const response = await axios.delete(`/api/emails/${emailId}`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      setSelectedEmail(null);
      setShowEmailView(false);
      toast.success('Email deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete email');
    }
  });

  const markImportantMutation = useMutation(async ({ emailId, isImportant }) => {
    const response = await axios.put(`/api/emails/${emailId}`, { isImportant });
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('emails');
      toast.success('Email marked as important');
    }
  });

  const folders = [
    { id: 'inbox', name: 'Inbox', icon: Inbox, count: emails?.filter(e => !e.isSent && !e.isDraft).length || 0 },
    { id: 'sent', name: 'Sent', icon: Send, count: emails?.filter(e => e.isSent).length || 0 },
    { id: 'drafts', name: 'Drafts', icon: FileText, count: emails?.filter(e => e.isDraft).length || 0 },
    { id: 'important', name: 'Important', icon: Star, count: emails?.filter(e => e.isImportant).length || 0 }
  ];

  const handleEmailClick = (email) => {
    setSelectedEmail(email);
    setShowEmailView(true);
  };

  const handleReply = () => {
    setShowReply(true);
  };

  const handleForward = () => {
    setShowForward(true);
  };

  const handleDelete = () => {
    if (selectedEmail) {
      deleteEmailMutation.mutate(selectedEmail.id);
    }
  };

  const handleMarkImportant = () => {
    if (selectedEmail) {
      markImportantMutation.mutate({
        emailId: selectedEmail.id,
        isImportant: !selectedEmail.isImportant
      });
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - d);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Client</h1>
          <p className="text-gray-600">Manage your emails and communications</p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Compose
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="space-y-2">
              {folders.map((folder) => {
                const Icon = folder.icon;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                      selectedFolder === folder.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className="h-5 w-5 mr-3" />
                      <span className="font-medium">{folder.name}</span>
                    </div>
                    {folder.count > 0 && (
                      <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
                        {folder.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Email List */}
        <div className="lg:col-span-3">
          <div className="card">
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search emails..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Email List */}
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : emails?.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No emails found</p>
                </div>
              ) : (
                emails?.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => handleEmailClick(email)}
                    className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedEmail?.id === email.id ? 'bg-primary-50 border-primary-200' : 'border-gray-200'
                    } ${!email.isRead ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {email.isSent ? email.to : email.from}
                          </span>
                          {email.isImportant && (
                            <Star className="h-4 w-4 text-yellow-500 fill-current" />
                          )}
                          {!email.isRead && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{email.subject}</p>
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {email.bodyText.substring(0, 100)}...
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <span className="text-xs text-gray-500">
                          {formatDate(email.receivedAt || email.sentAt)}
                        </span>
                        {email.attachments.length > 0 && (
                          <Paperclip className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email View Modal */}
      <Transition appear show={showEmailView} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowEmailView(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  {selectedEmail && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                          {selectedEmail.subject}
                        </Dialog.Title>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={handleMarkImportant}
                            className="text-gray-400 hover:text-yellow-500"
                          >
                            <Star className={`h-5 w-5 ${selectedEmail.isImportant ? 'text-yellow-500 fill-current' : ''}`} />
                          </button>
                          <button
                            onClick={handleReply}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Reply className="h-5 w-5" />
                          </button>
                          <button
                            onClick={handleForward}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Forward className="h-5 w-5" />
                          </button>
                          <button
                            onClick={handleDelete}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="border-t pt-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">From:</span>
                            <p className="text-gray-900">{selectedEmail.from}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">To:</span>
                            <p className="text-gray-900">{selectedEmail.to}</p>
                          </div>
                          {selectedEmail.cc && (
                            <div>
                              <span className="font-medium text-gray-700">CC:</span>
                              <p className="text-gray-900">{selectedEmail.cc}</p>
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-gray-700">Date:</span>
                            <p className="text-gray-900">
                              {new Date(selectedEmail.receivedAt || selectedEmail.sentAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t pt-4">
                        <div 
                          className="prose max-w-none"
                          dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                        />
                      </div>
                      
                      {selectedEmail.attachments.length > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium text-gray-700 mb-2">Attachments</h4>
                          <div className="space-y-2">
                            {selectedEmail.attachments.map((attachment, index) => (
                              <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                                <Paperclip className="h-4 w-4 text-gray-400" />
                                <span className="text-sm text-gray-700">{attachment.name}</span>
                                <span className="text-xs text-gray-500">({attachment.size})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          onClick={() => setShowEmailView(false)}
                          className="btn-secondary"
                        >
                          Close
                        </button>
                        <button
                          onClick={handleReply}
                          className="btn-primary"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        onSubmit={(data) => sendEmailMutation.mutate(data)}
        loading={sendEmailMutation.isLoading}
        clients={clients}
        templates={templates}
      />

      {/* Reply Modal */}
      <ReplyModal
        isOpen={showReply}
        onClose={() => setShowReply(false)}
        onSubmit={(data) => replyEmailMutation.mutate({ emailId: selectedEmail?.id, data })}
        loading={replyEmailMutation.isLoading}
        originalEmail={selectedEmail}
      />

      {/* Forward Modal */}
      <ForwardModal
        isOpen={showForward}
        onClose={() => setShowForward(false)}
        onSubmit={(data) => forwardEmailMutation.mutate({ emailId: selectedEmail?.id, data })}
        loading={forwardEmailMutation.isLoading}
        originalEmail={selectedEmail}
      />
    </div>
  );
};

// Compose Modal Component
const ComposeModal = ({ isOpen, onClose, onSubmit, loading, clients, templates }) => {
  const [formData, setFormData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    bodyText: '',
    isDraft: false,
    clientId: '',
    templateId: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleBodyChange = (e) => {
    const html = e.target.value;
    const text = html.replace(/<[^>]*>/g, ''); // Strip HTML tags for text version
    setFormData({
      ...formData,
      body: html,
      bodyText: text
    });
  };

  const handleTemplateChange = (e) => {
    const templateId = e.target.value;
    if (templateId) {
      const template = templates?.find(t => t.id === templateId);
      if (template) {
        setFormData({
          ...formData,
          subject: template.subject,
          body: template.bodyHtml,
          bodyText: template.bodyText,
          templateId
        });
      }
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                  Compose Email
                </Dialog.Title>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        To
                      </label>
                      <input
                        type="email"
                        name="to"
                        required
                        value={formData.to}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="recipient@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client (Optional)
                      </label>
                      <select
                        name="clientId"
                        value={formData.clientId}
                        onChange={handleChange}
                        className="input-field"
                      >
                        <option value="">Select Client</option>
                        {clients?.map(client => (
                          <option key={client.id} value={client.id}>
                            {client.firstName} {client.lastName} ({client.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CC
                      </label>
                      <input
                        type="email"
                        name="cc"
                        value={formData.cc}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="cc@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        BCC
                      </label>
                      <input
                        type="email"
                        name="bcc"
                        value={formData.bcc}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="bcc@example.com"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template (Optional)
                    </label>
                    <select
                      name="templateId"
                      value={formData.templateId}
                      onChange={handleTemplateChange}
                      className="input-field"
                    >
                      <option value="">Select Template</option>
                      {templates?.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="Email subject"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      name="body"
                      rows="8"
                      required
                      value={formData.body}
                      onChange={handleBodyChange}
                      className="input-field"
                      placeholder="Type your message here..."
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="isDraft"
                      checked={formData.isDraft}
                      onChange={(e) => setFormData({ ...formData, isDraft: e.target.checked })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 block text-sm text-gray-900">
                      Save as draft
                    </label>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? 'Sending...' : formData.isDraft ? 'Save Draft' : 'Send'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// Reply Modal Component
const ReplyModal = ({ isOpen, onClose, onSubmit, loading, originalEmail }) => {
  const [formData, setFormData] = useState({
    body: '',
    bodyText: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    const html = e.target.value;
    const text = html.replace(/<[^>]*>/g, '');
    setFormData({
      body: html,
      bodyText: text
    });
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                  Reply to: {originalEmail?.subject}
                </Dialog.Title>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>To:</strong> {originalEmail?.from}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Subject:</strong> {originalEmail?.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail?.subject}`}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Reply
                    </label>
                    <textarea
                      name="body"
                      rows="8"
                      required
                      value={formData.body}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="Type your reply here..."
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// Forward Modal Component
const ForwardModal = ({ isOpen, onClose, onSubmit, loading, originalEmail }) => {
  const [formData, setFormData] = useState({
    to: '',
    cc: '',
    bcc: '',
    body: '',
    bodyText: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleBodyChange = (e) => {
    const html = e.target.value;
    const text = html.replace(/<[^>]*>/g, '');
    setFormData({
      ...formData,
      body: html,
      bodyText: text
    });
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                  Forward: {originalEmail?.subject}
                </Dialog.Title>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        To
                      </label>
                      <input
                        type="email"
                        name="to"
                        required
                        value={formData.to}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="recipient@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CC
                      </label>
                      <input
                        type="email"
                        name="cc"
                        value={formData.cc}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="cc@example.com"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      BCC
                    </label>
                    <input
                      type="email"
                      name="bcc"
                      value={formData.bcc}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="bcc@example.com"
                    />
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Original Subject:</strong> {originalEmail?.subject}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>From:</strong> {originalEmail?.from}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Date:</strong> {new Date(originalEmail?.receivedAt || originalEmail?.sentAt).toLocaleString()}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Message (Optional)
                    </label>
                    <textarea
                      name="body"
                      rows="6"
                      value={formData.body}
                      onChange={handleBodyChange}
                      className="input-field"
                      placeholder="Add a message to accompany the forwarded email..."
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? 'Forwarding...' : 'Forward'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default EmailClient;
