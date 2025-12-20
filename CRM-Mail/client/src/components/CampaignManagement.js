import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Play,
  Pause,
  Square,
  Edit,
  Trash2,
  Eye,
  Upload,
  Download,
  BarChart3,
  Users,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Settings,
  Target,
  FileText,
  Send,
  Filter,
  Search,
  ChevronRight,
  ChevronLeft,
  X,
  User,
  Building,
  Globe,
  Phone,
  MapPin,
  Tag,
  Star,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

const CampaignManagement = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showStageMapping, setShowStageMapping] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const isCeo = (user?.role || '').toLowerCase() === 'ceo';

  // Fetch campaigns
  const { data: campaigns = [], isLoading } = useQuery(
    ['campaigns', filterStatus],
    async () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const response = await axios.get(`/api/campaigns?${params}`);
      return response.data.campaigns || [];
    }
  );

  // Fetch templates
  const { data: templates = [] } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  // Fetch SMTP accounts
  const { data: smtpAccounts = [] } = useQuery('smtp-accounts', async () => {
    const response = await axios.get('/api/smtp-accounts');
    return response.data;
  });

  const groupedSmtpAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(smtpAccounts) ? smtpAccounts : [];
    const shared = accountsArray.filter(account => account.isSystemAccount);
    const mine = accountsArray.filter(account => !account.isSystemAccount && account.ownerId === currentUserId);
    const others = accountsArray.filter(account => !account.isSystemAccount && account.ownerId && account.ownerId !== currentUserId);
    return { shared, mine, others };
  }, [smtpAccounts, currentUserId]);

  // Fetch conferences
  const { data: conferences = [] } = useQuery('conferences', async () => {
    const response = await axios.get('/api/conferences');
    return response.data;
  });

  // Start campaign mutation
  const startCampaignMutation = useMutation(
    async (campaignId) => {
      const response = await axios.post(`/api/campaigns/${campaignId}/start`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign started successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to start campaign');
      }
    }
  );

  // Pause campaign mutation
  const pauseCampaignMutation = useMutation(
    async (campaignId) => {
      const response = await axios.post(`/api/campaigns/${campaignId}/pause`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign paused successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to pause campaign');
      }
    }
  );

  // Resume campaign mutation
  const resumeCampaignMutation = useMutation(
    async (campaignId) => {
      const response = await axios.post(`/api/campaigns/${campaignId}/resume`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign resumed successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to resume campaign');
      }
    }
  );

  // Cancel campaign mutation
  const cancelCampaignMutation = useMutation(
    async (campaignId) => {
      const response = await axios.post(`/api/campaigns/${campaignId}/cancel`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign cancelled successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to cancel campaign');
      }
    }
  );

  // Delete campaign mutation
  const deleteCampaignMutation = useMutation(
    async (campaignId) => {
      const response = await axios.delete(`/api/campaigns/${campaignId}`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete campaign');
      }
    }
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'running': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft': return <Edit className="h-4 w-4" />;
      case 'running': return <Play className="h-4 w-4" />;
      case 'paused': return <Pause className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const handleAction = (action, campaignId) => {
    switch (action) {
      case 'start':
        startCampaignMutation.mutate(campaignId);
        break;
      case 'pause':
        pauseCampaignMutation.mutate(campaignId);
        break;
      case 'resume':
        resumeCampaignMutation.mutate(campaignId);
        break;
      case 'cancel':
        cancelCampaignMutation.mutate(campaignId);
        break;
      case 'delete':
        if (window.confirm('Are you sure you want to delete this campaign?')) {
          deleteCampaignMutation.mutate(campaignId);
        }
        break;
      case 'view-progress':
        setSelectedCampaign(campaignId);
        setShowProgressModal(true);
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Management</h1>
          <p className="text-gray-600">Manage bulk email campaigns and track performance</p>
        </div>
        
        <div className="flex items-center space-x-4 mt-4 sm:mt-0">
          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Stage Mapping Button */}
          <button
            onClick={() => setShowStageMapping(true)}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Stage Mapping
          </button>

          {/* Create Campaign Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Campaign
          </button>
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            onAction={handleAction}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
          />
        ))}
      </div>

      {/* Empty State */}
      {campaigns.length === 0 && (
        <div className="text-center py-12">
          <Mail className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new campaign.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </button>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          templates={templates}
          smtpAccounts={smtpAccounts}
          conferences={conferences}
          currentUserId={currentUserId}
          isCeo={isCeo}
        />
      )}

      {/* Progress Modal */}
      {showProgressModal && selectedCampaign && (
        <CampaignProgressModal
          campaignId={selectedCampaign}
          onClose={() => setShowProgressModal(false)}
        />
      )}

      {/* Stage Mapping Modal */}
      {showStageMapping && (
        <StageMappingModal
          onClose={() => setShowStageMapping(false)}
        />
      )}
    </div>
  );
};

// Campaign Card Component
const CampaignCard = ({ campaign, onAction, getStatusColor, getStatusIcon }) => {
  const progressPercentage = campaign.totalRecipients > 0 
    ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100) 
    : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
          <p className="text-sm text-gray-600">{campaign.description}</p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
          {getStatusIcon(campaign.status)}
          <span className="ml-1 capitalize">{campaign.status}</span>
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span>{progressPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{campaign.sentCount}</div>
          <div className="text-sm text-gray-600">Sent</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{campaign.totalRecipients}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        {campaign.status === 'draft' && (
          <button
            onClick={() => onAction('start', campaign.id)}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
          >
            <Play className="h-4 w-4 mr-1" />
            Start
          </button>
        )}
        
        {campaign.status === 'running' && (
          <button
            onClick={() => onAction('pause', campaign.id)}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
          >
            <Pause className="h-4 w-4 mr-1" />
            Pause
          </button>
        )}
        
        {campaign.status === 'paused' && (
          <button
            onClick={() => onAction('resume', campaign.id)}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
          >
            <Play className="h-4 w-4 mr-1" />
            Resume
          </button>
        )}
        
        {['running', 'paused'].includes(campaign.status) && (
          <button
            onClick={() => onAction('cancel', campaign.id)}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
          >
            <Square className="h-4 w-4 mr-1" />
            Cancel
          </button>
        )}

        <button
          onClick={() => onAction('view-progress', campaign.id)}
          className="px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200"
        >
          <BarChart3 className="h-4 w-4" />
        </button>

        {['draft', 'cancelled'].includes(campaign.status) && (
          <button
            onClick={() => onAction('delete', campaign.id)}
            className="px-3 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-md hover:bg-red-200"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Enhanced Multi-Step Campaign Creation Modal
const CreateCampaignModal = ({
  onClose,
  templates,
  smtpAccounts = [],
  conferences,
  currentUserId = null,
  isCeo = false
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Basic Information
    name: '',
    description: '',
    conferenceId: '',
    
    // Step 2: Template Selection
    templateId: '',
    templateStage: '',
    
    // Step 3: Recipients
    recipientSource: 'manual', // 'manual', 'conference', 'import'
    recipientData: {
      recipients: []
    },
    recipientFilters: {
      status: 'all',
      country: '',
      organization: ''
    },
    
    // Step 4: Email Settings
    smtpAccountId: '',
    subject: '',
    fromName: '',
    replyTo: '',
    
    // Step 5: Scheduling & Settings
    scheduleType: 'immediate', // 'immediate', 'scheduled', 'draft'
    scheduledAt: '',
    settings: {
      throttleRate: 100,
      batchSize: 50,
      retryAttempts: 3,
      retryDelay: 300000
    }
  });

  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRecipientPreview, setShowRecipientPreview] = useState(false);

  const queryClient = useQueryClient();

  // Fetch clients for recipient selection
  const { data: clients = [] } = useQuery(
    ['clients', formData.conferenceId, searchTerm],
    async () => {
      if (!formData.conferenceId) return [];
      const params = new URLSearchParams();
      params.append('conferenceId', formData.conferenceId);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await axios.get(`/api/clients?${params}`);
      return response.data;
    },
    { enabled: !!formData.conferenceId }
  );

  const createCampaignMutation = useMutation(
    async (data) => {
      const response = await axios.post('/api/campaigns', data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('campaigns');
        toast.success('Campaign created successfully');
        onClose();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create campaign');
      }
    }
  );

  const groupedSmtpAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(smtpAccounts) ? smtpAccounts : [];
    const shared = accountsArray.filter(account => account.isSystemAccount);
    const mine = accountsArray.filter(account => !account.isSystemAccount && account.ownerId === currentUserId);
    const others = accountsArray.filter(account => !account.isSystemAccount && account.ownerId && account.ownerId !== currentUserId);
    return { shared, mine, others };
  }, [smtpAccounts, currentUserId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const campaignData = {
      ...formData,
      recipientData: {
        recipients: selectedRecipients,
        filters: formData.recipientFilters
      }
    };
    createCampaignMutation.mutate(campaignData);
  };

  const nextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addRecipient = (client) => {
    if (!selectedRecipients.find(r => r.id === client.id)) {
      setSelectedRecipients([...selectedRecipients, {
        id: client.id,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        country: client.country,
        organization: client.organization
      }]);
    }
  };

  const removeRecipient = (clientId) => {
    setSelectedRecipients(selectedRecipients.filter(r => r.id !== clientId));
  };

  const filteredClients = clients.filter(client => 
    client.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Campaign</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Conference</label>
              <select
                value={formData.conferenceId}
                onChange={(e) => setFormData({...formData, conferenceId: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Conference</option>
                {conferences.map(conference => (
                  <option key={conference.id} value={conference.id}>
                    {conference.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Template</label>
              <select
                value={formData.templateId}
                onChange={(e) => setFormData({...formData, templateId: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Template</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">SMTP Account</label>
              <select
                value={formData.smtpAccountId}
                onChange={(e) => setFormData({...formData, smtpAccountId: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select SMTP Account</option>
                {[
                  { label: 'Shared (System)', accounts: groupedSmtpAccounts.shared },
                  { label: 'My Accounts', accounts: groupedSmtpAccounts.mine },
                  ...(isCeo ? [{ label: 'Team Accounts', accounts: groupedSmtpAccounts.others }] : [])
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

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCampaignMutation.isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createCampaignMutation.isLoading ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Campaign Progress Modal Component
const CampaignProgressModal = ({ campaignId, onClose }) => {
  const { data: campaign, isLoading } = useQuery(
    ['campaign', campaignId],
    async () => {
      const response = await axios.get(`/api/campaigns/${campaignId}`);
      return response.data;
    },
    {
      enabled: !!campaignId,
      refetchInterval: 5000 // Refetch every 5 seconds
    }
  );

  const { data: status } = useQuery(
    ['campaign-status', campaignId],
    async () => {
      const response = await axios.get(`/api/campaigns/${campaignId}/status`);
      return response.data;
    },
    {
      enabled: !!campaignId,
      refetchInterval: 3000 // Refetch every 3 seconds
    }
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Campaign Progress</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        {campaign && status && (
          <div className="space-y-6">
            {/* Campaign Info */}
            <div>
              <h4 className="text-lg font-semibold text-gray-900">{campaign.name}</h4>
              <p className="text-gray-600">{campaign.description}</p>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Overall Progress</span>
                <span>{status.progressPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${status.progressPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{status.totalRecipients}</div>
                <div className="text-sm text-gray-600">Total Recipients</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{status.sentCount}</div>
                <div className="text-sm text-gray-600">Sent</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{status.deliveredCount}</div>
                <div className="text-sm text-gray-600">Delivered</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{status.bouncedCount}</div>
                <div className="text-sm text-gray-600">Bounced</div>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{status.deliveryRate}%</div>
                <div className="text-sm text-gray-600">Delivery Rate</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{status.bounceRate}%</div>
                <div className="text-sm text-gray-600">Bounce Rate</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{status.replyRate}%</div>
                <div className="text-sm text-gray-600">Reply Rate</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{status.openRate}%</div>
                <div className="text-sm text-gray-600">Open Rate</div>
              </div>
            </div>

            {/* Status */}
            <div className="text-center">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                status.status === 'running' ? 'bg-green-100 text-green-800' :
                status.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                status.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {status.status === 'running' && <Play className="h-4 w-4 mr-1" />}
                {status.status === 'paused' && <Pause className="h-4 w-4 mr-1" />}
                {status.status === 'completed' && <CheckCircle className="h-4 w-4 mr-1" />}
                {status.status}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Stage Mapping Modal Component
const StageMappingModal = ({ onClose }) => {
  const [stage1Settings, setStage1Settings] = useState({
    interval: 7,
    maxAttempts: 6,
    skipWeekends: true,
    templateId: ''
  });
  
  const [stage2Settings, setStage2Settings] = useState({
    interval: 3,
    maxAttempts: 6,
    skipWeekends: true,
    templateId: ''
  });

  const { data: templates = [] } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  const { data: conferences = [] } = useQuery('conferences', async () => {
    const response = await axios.get('/api/conferences');
    return response.data;
  });

  const handleSave = async () => {
    try {
      // Save stage mapping settings to conference
      // This would typically update the conference settings
      toast.success('Stage mapping saved successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to save stage mapping');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Stage Mapping Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Stage 1: Abstract Submission */}
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Stage 1: Abstract Submission</h3>
              <p className="text-sm text-blue-700">
                Initial invitation email with automated follow-ups every 7 days, skipping weekends.
                Up to 6 follow-ups. Moves to Stage 2 when abstract is submitted.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Follow-up Interval (Days)
                </label>
                <input
                  type="number"
                  value={stage1Settings.interval}
                  onChange={(e) => setStage1Settings({...stage1Settings, interval: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Follow-up Attempts
                </label>
                <input
                  type="number"
                  value={stage1Settings.maxAttempts}
                  onChange={(e) => setStage1Settings({...stage1Settings, maxAttempts: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Template
                </label>
                <select
                  value={stage1Settings.templateId}
                  onChange={(e) => setStage1Settings({...stage1Settings, templateId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select template</option>
                  {templates.filter(t => t.stage === 'abstract_submission').map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="stage1-skip-weekends"
                  checked={stage1Settings.skipWeekends}
                  onChange={(e) => setStage1Settings({...stage1Settings, skipWeekends: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="stage1-skip-weekends" className="ml-2 text-sm text-gray-700">
                  Skip weekends
                </label>
              </div>
            </div>
          </div>

          {/* Stage 2: Registration */}
          <div className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 mb-2">Stage 2: Registration</h3>
              <p className="text-sm text-green-700">
                Triggered when abstract is submitted. Follow-up every 3 days, skipping weekends.
                Up to 6 follow-ups. Stops when client registers.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Follow-up Interval (Days)
                </label>
                <input
                  type="number"
                  value={stage2Settings.interval}
                  onChange={(e) => setStage2Settings({...stage2Settings, interval: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="1"
                  max="30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Follow-up Attempts
                </label>
                <input
                  type="number"
                  value={stage2Settings.maxAttempts}
                  onChange={(e) => setStage2Settings({...stage2Settings, maxAttempts: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="1"
                  max="20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Template
                </label>
                <select
                  value={stage2Settings.templateId}
                  onChange={(e) => setStage2Settings({...stage2Settings, templateId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select template</option>
                  {templates.filter(t => t.stage === 'registration').map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="stage2-skip-weekends"
                  checked={stage2Settings.skipWeekends}
                  onChange={(e) => setStage2Settings({...stage2Settings, skipWeekends: e.target.checked})}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor="stage2-skip-weekends" className="ml-2 text-sm text-gray-700">
                  Skip weekends
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Save Stage Mapping
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignManagement;
