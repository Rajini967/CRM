import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Mail,
  Calendar,
  TrendingUp,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  Globe,
  Settings,
  Bell,
  RefreshCw,
  Download,
  Filter,
  Search
} from 'lucide-react';

const EnhancedDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [selectedConference, setSelectedConference] = useState('all');
  const [refreshInterval, setRefreshInterval] = useState(5 * 60 * 1000); // 5 minutes instead of 30 seconds
  const navigate = useNavigate();

  // Fetch dashboard data with optimized loading
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useQuery(
    ['dashboard', selectedTimeRange, selectedConference],
    async () => {
      try {
        const response = await axios.get('/api/dashboard', {
          params: { timeRange: selectedTimeRange, conferenceId: selectedConference }
        });
        return response.data;
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Return safe default data structure
        return {
          totalClients: 0,
          totalConferences: 0,
          totalEmails: 0,
          recentClients: [],
          kpis: {
            abstractsSubmitted: 0,
            registered: 0,
            conversionRate: 0,
            totalRevenue: 0
          },
          emailPerformance: {
            deliveryRate: 0,
            bounceRate: 0,
            replyRate: 0
          },
          needsAttention: {
            bouncedEmails: [],
            unansweredReplies: []
          }
        };
      }
    },
    {
      refetchInterval: refreshInterval,
      refetchOnWindowFocus: false, // Disable auto-refresh on focus to improve performance
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
      retry: 2, // Reduce retries for faster failure handling
      onError: (error) => {
        console.error('Dashboard query error:', error);
        toast.error('Failed to load dashboard data. Please try again.');
      }
    }
  );

  // Fetch analytics data only for CEO users
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery(
    ['analytics', selectedTimeRange],
    async () => {
      const response = await axios.get('/api/analytics/ceo-dashboard');
      return response.data;
    },
    {
      enabled: user?.role === 'CEO', // Only fetch for CEO users
      staleTime: 10 * 60 * 1000, // Analytics data can be stale for 10 minutes
      cacheTime: 15 * 60 * 1000
    }
  );

  // Fetch system status with reduced frequency
  const { data: systemStatus, isLoading: statusLoading } = useQuery(
    'system-status',
    async () => {
      const response = await axios.get('/api/system/status');
      return response.data;
    },
    {
      refetchInterval: 5 * 60 * 1000, // Reduced to 5 minutes
      staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
      cacheTime: 10 * 60 * 1000
    }
  );

  // Fetch notifications with optimized settings
  const { data: notifications, isLoading: notificationsLoading, error: notificationsError } = useQuery(
    'notifications',
    async () => {
      try {
        const response = await axios.get('/api/notifications', {
          params: { limit: 10 }
        });
        return response.data;
      } catch (error) {
        console.error('Error fetching notifications:', error);
        return []; // Return empty array on error
      }
    },
    {
      refetchInterval: 2 * 60 * 1000, // Reduced to 2 minutes
      refetchOnWindowFocus: false, // Disable auto-refresh on focus
      staleTime: 1 * 60 * 1000, // Consider fresh for 1 minute
      cacheTime: 5 * 60 * 1000,
      retry: 1 // Only retry once on failure
    }
  );

  // Fetch recent activity with lazy loading
  const { data: recentActivity, isLoading: activityLoading } = useQuery(
    'recent-activity',
    async () => {
      const response = await axios.get('/api/analytics/recent-activity');
      return response.data;
    },
    {
      enabled: !dashboardLoading, // Only fetch after dashboard loads
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000
    }
  );

  // Optimized auto-refresh functionality
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh essential data, not all queries
      queryClient.invalidateQueries(['dashboard']);
      if (user?.role === 'CEO') {
        queryClient.invalidateQueries(['analytics']);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, queryClient, user?.role]);

  // Manual refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast.success('Dashboard refreshed');
  };

  // Export data
  const handleExport = async (type) => {
    try {
      const response = await axios.get(`/api/analytics/export`, {
        params: { type, format: 'csv' },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(`${type} data exported successfully`);
    } catch (error) {
      toast.error('Export failed');
    }
  };

  // Show loading only for essential data, allow partial rendering
  if (dashboardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = dashboardData || {};
  const analytics = analyticsData || {};
  const status = systemStatus || {};

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.name || user?.email}!
            </h1>
            <p className="text-gray-600 mt-2">
              Here's what's happening with your conference management system.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
            <div className="flex items-center space-x-2">
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="1d">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">System Status</h2>
            {statusLoading ? (
              <div className="animate-pulse flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                <div className="h-4 w-16 bg-gray-300 rounded"></div>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${status.database === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">Database</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {statusLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse"></div>
                  <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
                </div>
              ))
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${status.emailService === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-600">Email Service</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${status.followUpService === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-600">Follow-up Service</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${status.realTimeSync === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-600">Real-time Sync</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-600">Last Updated: {status.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'N/A'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalClients || 0}</p>
            </div>
            <Users className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/email')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/email');
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Emails Sent</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalEmails || 0}</p>
            </div>
            <Mail className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => navigate('/conferences')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/conferences');
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Conferences</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalConferences || 0}</p>
            </div>
            <Calendar className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div 
          className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
          onClick={() => {
            // For conversion rate, we can navigate to analytics or stay on dashboard with filter
            // You can customize this based on your needs
            if (user?.role === 'CEO') {
              navigate('/analytics');
            } else {
              navigate('/clients');
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (user?.role === 'CEO') {
                navigate('/analytics');
              } else {
                navigate('/clients');
              }
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
              <p className="text-3xl font-bold text-primary-600">{stats.kpis?.conversionRate || 0}%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-primary-600" />
          </div>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Submission Stats</h3>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Abstracts Submitted</span>
              <span className="text-2xl font-bold text-gray-900">{stats.kpis?.abstractsSubmitted || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Registered</span>
              <span className="text-2xl font-bold text-primary-600">{stats.kpis?.registered || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Conversion Rate</span>
              <span className="text-2xl font-bold text-green-600">{stats.kpis?.conversionRate || 0}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Email Health</h3>
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Delivery Rate</span>
              <span className="text-2xl font-bold text-green-600">{stats.emailPerformance?.deliveryRate || 0}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Reply Rate</span>
              <span className="text-2xl font-bold text-primary-600">{stats.emailPerformance?.replyRate || 0}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Bounce Rate</span>
              <span className="text-2xl font-bold text-red-600">{stats.emailPerformance?.bounceRate || 0}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity and Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-300 rounded animate-pulse mb-1"></div>
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity?.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary-600 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500">{activity.timestamp}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No recent activity</p>
              </div>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {notificationsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-gray-500">Loading notifications...</p>
              </div>
            ) : notificationsError ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
                <p className="text-red-500">Failed to load notifications</p>
                <p className="text-xs text-gray-400 mt-1">Please refresh the page</p>
              </div>
            ) : Array.isArray(notifications) && notifications.length > 0 ? (
              notifications.map((notification, index) => (
                <div key={notification.id || index} className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    notification.priority === 'high' ? 'bg-red-500' :
                    notification.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{notification.title || notification.message}</p>
                    <p className="text-xs text-gray-500">{notification.message}</p>
                    <p className="text-xs text-gray-400">
                      {notification.createdAt ? new Date(notification.createdAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No notifications</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              className="flex items-center justify-center px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              onClick={() => navigate('/clients')}
            >
              <Users className="w-5 h-5 mr-2" />
              Add New Client
            </button>
            <button
              className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              onClick={() => navigate('/email')}
            >
              <Mail className="w-5 h-5 mr-2" />
              Send Email
            </button>
            <button
              className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              onClick={() => navigate('/conferences')}
            >
              <Calendar className="w-5 h-5 mr-2" />
              Create Conference
            </button>
          </div>
        </div>
      </div>

      {/* Conferences Overview (role-scoped) */}
      <div className="mt-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Conferences Overview</h3>
          </div>
          {Array.isArray(stats.conferences) && stats.conferences.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.conferences.map((c) => (
                <div key={c.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Name</p>
                      <p className="font-semibold text-gray-900">{c.name}</p>
                    </div>
                    <Calendar className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Start</p>
                      <p className="text-gray-900">{c.startDate ? new Date(c.startDate).toLocaleDateString() : '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">End</p>
                      <p className="text-gray-900">{c.endDate ? new Date(c.endDate).toLocaleDateString() : '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Venue</p>
                      <p className="text-gray-900">{c.venue || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Primary Contact</p>
                      <p className="text-gray-900">{c.primaryContact?.name || '—'} {c.primaryContact?.email ? `• ${c.primaryContact.email}` : ''}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No conferences available</div>
          )}
        </div>
      </div>

      {/* Needs Attention */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Bounced Emails (7 days)</h3>
          <div className="space-y-3">
            {(stats.needsAttention?.bouncedEmails || []).length === 0 ? (
              <div className="text-gray-500">No bounced emails</div>
            ) : (
              (stats.needsAttention?.bouncedEmails || []).map((e) => (
                <div key={e.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{e.clientName || 'Unknown client'}</span>
                  <span className="text-gray-500">{e.sentAt ? new Date(e.sentAt).toLocaleDateString() : ''}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Unanswered Replies (24h)</h3>
          <div className="space-y-3">
            {(stats.needsAttention?.unansweredReplies || []).length === 0 ? (
              <div className="text-gray-500">No pending replies</div>
            ) : (
              (stats.needsAttention?.unansweredReplies || []).map((e) => (
                <div key={e.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{e.clientName || 'Unknown client'}</span>
                  <span className="text-gray-500">{e.date ? new Date(e.date).toLocaleTimeString() : ''}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;