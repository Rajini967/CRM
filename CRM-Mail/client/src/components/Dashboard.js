import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Mail,
  TrendingUp,
  Clock,
  CheckCircle
} from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data: stats, isLoading } = useQuery('dashboard-stats', async () => {
    const response = await axios.get('/api/dashboard/stats');
    return response.data;
  });

  const { data: recentClients } = useQuery('recent-clients', async () => {
    const response = await axios.get('/api/clients?limit=5');
    return response.data;
  });

  const { data: recentEmails } = useQuery('recent-emails', async () => {
    const response = await axios.get('/api/email-logs?limit=5');
    return response.data;
  });

  // Show admin dashboard for CEO users
  if (user?.role === 'CEO') {
    return <AdminDashboard />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Clients',
      value: stats?.totalClients || 0,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Abstracts Submitted',
      value: stats?.abstractsSubmitted || 0,
      icon: FileText,
      color: 'bg-yellow-500',
      change: '+8%'
    },
    {
      title: 'Registered',
      value: stats?.registered || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
      change: '+15%'
    },
    {
      title: 'Conversion Rate',
      value: `${stats?.conversionRate || 0}%`,
      icon: TrendingUp,
      color: 'bg-purple-500',
      change: '+3%'
    },
    {
      title: 'Active Follow-ups',
      value: stats?.activeFollowups || 0,
      icon: Clock,
      color: 'bg-orange-500',
      change: '+5%'
    },
    {
      title: 'Emails Sent Today',
      value: stats?.emailsSentToday || 0,
      icon: Mail,
      color: 'bg-indigo-500',
      change: '+20%'
    }
  ];

  const getStatusBadge = (status) => {
    const statusClasses = {
      'Lead': 'status-badge status-lead',
      'Abstract Submitted': 'status-badge status-abstract',
      'Registered': 'status-badge status-registered',
      'Unresponsive': 'status-badge status-unresponsive'
    };
    return statusClasses[status] || 'status-badge bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Overview of your conference CRM</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          // Determine navigation route based on card type
          const getNavigationRoute = () => {
            if (stat.title.includes('Client')) return '/clients';
            if (stat.title.includes('Email')) return '/email';
            if (stat.title.includes('Abstract')) return '/clients';
            if (stat.title.includes('Registered')) return '/clients';
            if (stat.title.includes('Conversion')) return '/clients';
            if (stat.title.includes('Follow-up')) return '/clients';
            return '/clients'; // Default route
          };
          
          return (
            <div 
              key={index} 
              className="card cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
              onClick={() => navigate(getNavigationRoute())}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavigationRoute());
                }
              }}
            >
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-sm text-green-600">{stat.change}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Clients</h3>
          <div className="space-y-3">
            {recentClients?.slice(0, 5).map((client) => (
              <div key={client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-sm text-gray-600">{client.email}</p>
                </div>
                <span className={getStatusBadge(client.status)}>
                  {client.status}
                </span>
              </div>
            ))}
            {(!recentClients || recentClients.length === 0) && (
              <p className="text-gray-500 text-center py-4">No clients yet</p>
            )}
          </div>
        </div>

        {/* Recent Email Activity */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Email Activity</h3>
          <div className="space-y-3">
            {recentEmails?.slice(0, 5).map((email) => (
              <div key={email.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{email.subject}</p>
                  <p className="text-sm text-gray-600">To: {email.to}</p>
                </div>
                <div className="text-right">
                  <span className={`status-badge ${
                    email.status === 'sent' ? 'bg-green-100 text-green-800' :
                    email.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {email.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(email.sentAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            {(!recentEmails || recentEmails.length === 0) && (
              <p className="text-gray-500 text-center py-4">No emails sent yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary flex items-center justify-center">
            <Users className="h-5 w-5 mr-2" />
            Add New Client
          </button>
          <button className="btn-secondary flex items-center justify-center">
            <Mail className="h-5 w-5 mr-2" />
            Send Bulk Email
          </button>
          <button className="btn-secondary flex items-center justify-center">
            <FileText className="h-5 w-5 mr-2" />
            Create Template
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
