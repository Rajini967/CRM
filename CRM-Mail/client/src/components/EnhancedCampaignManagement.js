import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
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

const EnhancedCampaignManagement = () => {
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const queryClient = useQueryClient();

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
  const { data: smtpAccounts = [] } = useQuery('smtpAccounts', async () => {
    const response = await axios.get('/api/email-accounts');
    return response.data;
  });

  // Fetch conferences
  const { data: conferences = [] } = useQuery('conferences', async () => {
    const response = await axios.get('/api/conferences');
    return response.data;
  });

  const getStatusBadge = (status) => {
    const statusClasses = {
      'draft': 'bg-gray-100 text-gray-800',
      'scheduled': 'bg-blue-100 text-blue-800',
      'running': 'bg-green-100 text-green-800',
      'paused': 'bg-yellow-100 text-yellow-800',
      'completed': 'bg-purple-100 text-purple-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`;
  };

  const getStatusIcon = (status) => {
    const statusIcons = {
      'draft': FileText,
      'scheduled': Clock,
      'running': Play,
      'paused': Pause,
      'completed': CheckCircle,
      'cancelled': XCircle
    };
    const IconComponent = statusIcons[status] || AlertCircle;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl shadow-sm border border-green-100 p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Automatic Email Campaigns</h1>
            <p className="text-gray-600 text-lg">Monitor and track automatic email campaigns triggered by client additions</p>
            <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Mail className="h-4 w-4 mr-1" />
                Automatic Sending
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                Stage-based Flow
              </div>
              <div className="flex items-center">
                <BarChart3 className="h-4 w-4 mr-1" />
                Real-time Tracking
              </div>
            </div>
          </div>
          <div className="bg-green-100 rounded-lg p-4 border border-green-200">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-600 mr-3" />
              <div>
                <h3 className="text-sm font-semibold text-green-900">Automatic System</h3>
                <p className="text-xs text-green-700">Emails are sent automatically when clients are added</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : campaigns?.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No automatic campaigns triggered yet</p>
            <p className="text-sm text-gray-400 mt-2">Campaigns are created automatically when clients are added to conferences</p>
          </div>
        ) : (
          campaigns?.map((campaign) => (
            <div key={campaign.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{campaign.name}</h3>
                  <span className={getStatusBadge(campaign.status)}>
                    {getStatusIcon(campaign.status)}
                    <span className="ml-1">{campaign.status}</span>
                  </span>
                </div>
              </div>
              
              <div className="space-y-3 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Trigger:</p>
                  <p className="text-sm text-gray-600 bg-green-50 p-2 rounded border-l-2 border-green-200">
                    Client added to conference
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Email Progress:</p>
                  <p className="text-sm text-gray-500">
                    {campaign.sentCount || 0} / {campaign.totalRecipients || 0} emails sent
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Stage Flow:</p>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Initial</span>
                    <span className="text-gray-400">→</span>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Stage 1</span>
                    <span className="text-gray-400">→</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Stage 2</span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setShowProgressModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                    title="View Progress"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>


      {/* Campaign Progress Modal */}
      {showProgressModal && selectedCampaign && (
        <CampaignProgressModal
          campaignId={selectedCampaign.id}
          onClose={() => {
            setShowProgressModal(false);
            setSelectedCampaign(null);
          }}
        />
      )}
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

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Campaign Progress</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {campaign && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-blue-900">Sent</p>
                <p className="text-2xl font-bold text-blue-600">{campaign.sentCount || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-green-900">Delivered</p>
                <p className="text-2xl font-bold text-green-600">{campaign.deliveredCount || 0}</p>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Campaign Details</h4>
              <p className="text-sm text-gray-600">Name: {campaign.name}</p>
              <p className="text-sm text-gray-600">Status: {campaign.status}</p>
              <p className="text-sm text-gray-600">Total Recipients: {campaign.totalRecipients || 0}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedCampaignManagement;
