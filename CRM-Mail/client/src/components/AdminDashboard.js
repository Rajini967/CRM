import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Mail,
  FileText,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Pause,
  Play,
  Square,
  BarChart3,
  Download,
  Filter,
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Send,
  Calendar,
  MapPin,
  User,
  Phone,
  Globe,
  Star,
  Activity,
  Target,
  DollarSign,
  Percent,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';

const AdminDashboard = () => {
  const [selectedConference, setSelectedConference] = useState(null);
  const [clientFilter, setClientFilter] = useState('all');
  const [clientSearch, setClientSearch] = useState('');
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch conferences
  const { data: conferences } = useQuery('conferences', async () => {
    const response = await axios.get('/api/conferences');
    return response.data;
  });

  // Fetch clients
  const { data: clients, isLoading: clientsLoading } = useQuery('clients', async () => {
    const response = await axios.get('/api/clients');
    return response.data;
  });

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery('dashboard-stats', async () => {
    const response = await axios.get('/api/dashboard/stats');
    return response.data;
  });

  // Fetch follow-up jobs
  const { data: followUpJobs } = useQuery('followup-jobs', async () => {
    const response = await axios.get('/api/followup/jobs');
    return response.data;
  });

  // Fetch follow-up stats
  const { data: followUpStats } = useQuery('followup-stats', async () => {
    const response = await axios.get('/api/followup/stats');
    return response.data;
  });

  // Fetch email logs
  const { data: emailLogs } = useQuery('email-logs', async () => {
    const response = await axios.get('/api/email-logs');
    return response.data;
  });

  // Follow-up mutations
  const createFollowUpMutation = useMutation(async (data) => {
    const response = await axios.post('/api/followup/jobs', data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('followup-jobs');
      toast.success('Follow-up job created successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create follow-up job');
    }
  });

  const pauseFollowUpMutation = useMutation(async (jobId) => {
    const response = await axios.put(`/api/followup/jobs/${jobId}/pause`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('followup-jobs');
      toast.success('Follow-up job paused');
    }
  });

  const resumeFollowUpMutation = useMutation(async (jobId) => {
    const response = await axios.put(`/api/followup/jobs/${jobId}/resume`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('followup-jobs');
      toast.success('Follow-up job resumed');
    }
  });

  const stopFollowUpMutation = useMutation(async (jobId) => {
    const response = await axios.put(`/api/followup/jobs/${jobId}/stop`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('followup-jobs');
      toast.success('Follow-up job stopped');
    }
  });

  // Set default conference
  useEffect(() => {
    if (conferences && conferences.length > 0 && !selectedConference) {
      setSelectedConference(conferences[0]);
    }
  }, [conferences, selectedConference]);

  // Filter clients
  const filteredClients = (clients || []).filter(client => {
    if (!client) return false;
    
    const matchesFilter = clientFilter === 'all' || client.status === clientFilter;
    const matchesSearch = clientSearch === '' || 
      (client.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (client.email || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (client.country || '').toLowerCase().includes(clientSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Lead': return 'bg-blue-100 text-blue-800';
      case 'Abstract Submitted': return 'bg-green-100 text-green-800';
      case 'Registered': return 'bg-purple-100 text-purple-800';
      case 'Unresponsive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get stage color
  const getStageColor = (stage) => {
    if (!stage) return 'bg-gray-100 text-gray-800';
    
    switch (stage.toString()) {
      case 'abstract_submission': return 'bg-orange-100 text-orange-800';
      case 'registration': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Export clients to CSV
  const exportClients = () => {
    const csvContent = [
      ['Name', 'Email', 'Country', 'Status', 'Phone', 'Created At'],
      ...filteredClients.map(client => [
        client.name,
        client.email,
        client.country,
        client.status,
        client.phone || '',
        new Date(client.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">Complete overview of your conference management</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={exportClients}
            className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Download className="h-4 w-4" />
            <span>Export Clients</span>
          </button>
        </div>
      </div>

      {/* Conference Info */}
      {selectedConference && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Conference Information</h2>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Active Conference</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="font-medium text-gray-900">{selectedConference.name}</h3>
              <p className="text-sm text-gray-600">Conference Name</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{selectedConference.date}</h3>
              <p className="text-sm text-gray-600">Conference Date</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{selectedConference.venue}</h3>
              <p className="text-sm text-gray-600">Venue</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/clients')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/clients');
            }
          }}
        >
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalClients || 0}</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/clients')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/clients');
            }
          }}
        >
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Abstracts Submitted</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.abstractsSubmitted || 0}</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/clients')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/clients');
            }
          }}
        >
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Registered</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.registered || 0}</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/clients')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/clients');
            }
          }}
        >
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Percent className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.conversionRate || 0}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Follow-up Statistics */}
      {followUpStats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Follow-up Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{followUpStats.totalJobs}</div>
              <div className="text-sm text-gray-600">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{followUpStats.activeJobs}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{followUpStats.pausedJobs}</div>
              <div className="text-sm text-gray-600">Paused</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{followUpStats.completedJobs}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{followUpStats.totalEmailsSent}</div>
              <div className="text-sm text-gray-600">Emails Sent</div>
            </div>
          </div>
        </div>
      )}

      {/* Client Management */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Client Management</h2>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="Lead">Lead</option>
                <option value="Abstract Submitted">Abstract Submitted</option>
                <option value="Registered">Registered</option>
                <option value="Unresponsive">Unresponsive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Follow-up
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.map((client) => {
                const followUpJob = followUpJobs?.find(job => job && job.clientId === client.id);
                return (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <User className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{client.name}</div>
                          <div className="text-sm text-gray-500">{client.country}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{client.email}</div>
                      {client.phone && (
                        <div className="text-sm text-gray-500">{client.phone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {followUpJob ? (
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(followUpJob.stage)}`}>
                            {(followUpJob.stage || '').toString().replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {followUpJob.followUpCount || 0}/{followUpJob.maxFollowUps || 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">No follow-up</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedClient(client);
                            setShowFollowUpModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        {followUpJob && (
                          <>
                            {followUpJob.paused ? (
                              <button
                                onClick={() => resumeFollowUpMutation.mutate(followUpJob.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => pauseFollowUpMutation.mutate(followUpJob.id)}
                                className="text-yellow-600 hover:text-yellow-900"
                              >
                                <Pause className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => stopFollowUpMutation.mutate(followUpJob.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Follow-up Jobs */}
      {followUpJobs && followUpJobs.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Active Follow-up Jobs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Send
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(followUpJobs || []).map((job) => {
                  if (!job || !job.id) return null;
                  
                  const followUpCount = job.followUpCount || 0;
                  const maxFollowUps = job.maxFollowUps || 1;
                  const progressPercentage = maxFollowUps > 0 ? (followUpCount / maxFollowUps) * 100 : 0;
                  
                  return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{job.client?.name || 'Unknown Client'}</div>
                        <div className="text-sm text-gray-500">{job.client?.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(job.stage)}`}>
                          {(job.stage || '').toString().replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${progressPercentage}%` }}
                            ></div>
                          </div>
                          <span className="ml-2 text-sm text-gray-600">
                            {followUpCount}/{maxFollowUps}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {job.nextSendAt ? new Date(job.nextSendAt).toLocaleDateString() : 'Not scheduled'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          job.status === 'active' ? 'bg-green-100 text-green-800' : 
                          job.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {job.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          {job.paused ? (
                            <button
                              onClick={() => resumeFollowUpMutation.mutate(job.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => pauseFollowUpMutation.mutate(job.id)}
                              className="text-yellow-600 hover:text-yellow-900"
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => stopFollowUpMutation.mutate(job.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
