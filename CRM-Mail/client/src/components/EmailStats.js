import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import {
  Mail,
  MailOpen,
  Star,
  Paperclip,
  Send,
  FileText,
  Trash2,
  TrendingUp,
  Clock,
  CheckCircle
} from 'lucide-react';

const EmailStats = () => {
  const { data: stats, isLoading } = useQuery('email-stats', async () => {
    const response = await axios.get('/api/emails/stats');
    return response.data;
  }, {
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Emails',
      value: stats?.total || 0,
      icon: Mail,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Unread',
      value: stats?.unread || 0,
      icon: MailOpen,
      color: 'bg-orange-500',
      change: '+5%'
    },
    {
      title: 'Important',
      value: stats?.important || 0,
      icon: Star,
      color: 'bg-yellow-500',
      change: '+8%'
    },
    {
      title: 'With Attachments',
      value: stats?.withAttachments || 0,
      icon: Paperclip,
      color: 'bg-purple-500',
      change: '+3%'
    },
    {
      title: 'Sent',
      value: stats?.sent || 0,
      icon: Send,
      color: 'bg-green-500',
      change: '+15%'
    },
    {
      title: 'Drafts',
      value: stats?.drafts || 0,
      icon: FileText,
      color: 'bg-gray-500',
      change: '+2%'
    },
    {
      title: 'Deleted',
      value: stats?.deleted || 0,
      icon: Trash2,
      color: 'bg-red-500',
      change: '+1%'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Email Statistics</h3>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          <span>Updated every 10 seconds</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-600">{stat.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.total > 0 ? ((stats.unread / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-600">Unread Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats?.total > 0 ? ((stats.important / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-600">Important Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {stats?.total > 0 ? ((stats.withAttachments / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-600">Attachment Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailStats;
