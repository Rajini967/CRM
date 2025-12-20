import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Mail,
  Play,
  Square,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Activity
} from 'lucide-react';

const ImapSettings = () => {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const queryClient = useQueryClient();

  // Fetch SMTP accounts
  const { data: smtpAccounts = [] } = useQuery('smtp-accounts', async () => {
    const response = await axios.get('/api/smtp-accounts');
    return response.data;
  });

  // Fetch IMAP status with real-time updates
  const { data: imapStatus, refetch: refetchStatus } = useQuery('imap-status', async () => {
    try {
      const response = await axios.get('/api/inbound/status');
      return response.data || {
        isPolling: false,
        totalConnections: 0,
        configuredAccounts: 0,
        connections: [],
        lastSync: null
      };
    } catch (error) {
      console.error('Error fetching IMAP status:', error);
      // Return empty status on error to prevent UI crashes
      return {
        isPolling: false,
        totalConnections: 0,
        configuredAccounts: 0,
        connections: [],
        lastSync: null
      };
    }
  }, {
    refetchInterval: 10000, // Refresh every 10 seconds for real-time status updates (reduced from 5s to prevent excessive requests)
    retry: 2,
    retryDelay: 1000,
    staleTime: 5000 // Consider data stale after 5 seconds
  });

  // Test IMAP connection
  const testImapMutation = useMutation(async (accountId) => {
    const response = await axios.post('/api/inbound/test', { accountId });
    return response.data;
  }, {
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`IMAP test successful: ${data.message}`);
      } else {
        // Show detailed error with suggestions
        let errorMsg = `IMAP test failed: ${data.error}`;
        if (data.suggestions && data.suggestions.length > 0) {
          errorMsg += '\n\nSuggestions:\n' + data.suggestions.join('\n');
        }
        toast.error(errorMsg, { duration: 8000 });
      }
    },
    onError: (error) => {
      const errorData = error.response?.data;
      let errorMsg = errorData?.error || 'IMAP test failed';
      if (errorData?.suggestions && errorData.suggestions.length > 0) {
        errorMsg += '\n\nSuggestions:\n' + errorData.suggestions.join('\n');
      }
      toast.error(errorMsg, { duration: 8000 });
    }
  });

  // Fetch emails from IMAP
  const fetchEmailsMutation = useMutation(async ({ accountId, maxMessages }) => {
    const response = await axios.post('/api/inbound/fetch', { accountId, maxMessages });
    return response.data;
  }, {
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Fetched ${data.emails?.length || 0} emails`);
        queryClient.invalidateQueries('emails');
        queryClient.invalidateQueries('email-logs');
      } else {
        toast.error(`Failed to fetch emails: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to fetch emails');
    }
  });

  // Control IMAP polling
  const pollingMutation = useMutation(async (action) => {
    const response = await axios.post('/api/inbound/polling', { action });
    return response.data;
  }, {
    onSuccess: (data) => {
      toast.success(data.message);
      refetchStatus();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to control polling');
    }
  });

  // Clear demo emails
  const clearEmailsMutation = useMutation(async () => {
    const response = await axios.post('/api/emails/clear');
    return response.data;
  }, {
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries('emails');
      queryClient.invalidateQueries('email-logs');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to clear emails');
    }
  });

  // Reset email state
  const resetEmailsMutation = useMutation(async () => {
    const response = await axios.post('/api/emails/reset');
    return response.data;
  }, {
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries('emails');
      queryClient.invalidateQueries('email-logs');
      refetchStatus();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to reset emails');
    }
  });

  const handleTestConnection = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account to test');
      return;
    }
    
    setIsTesting(true);
    try {
      await testImapMutation.mutateAsync(selectedAccount);
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchEmails = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account to fetch emails from');
      return;
    }
    
    setIsFetching(true);
    try {
      await fetchEmailsMutation.mutateAsync({ 
        accountId: selectedAccount, 
        maxMessages: 20 
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleStartPolling = () => {
    pollingMutation.mutate('start');
  };

  const handleStopPolling = () => {
    pollingMutation.mutate('stop');
  };

  const getStatusIcon = (isConnected, status) => {
    if (isConnected) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (status === 'active') {
      // Active but not connected - show yellow/orange indicator
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    } else if (status === 'error') {
      return <XCircle className="h-5 w-5 text-orange-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = (isConnected, retryCount, status, isPolling) => {
    if (isConnected) {
      return 'Connected';
    } else if (retryCount > 0) {
      return `Retrying (${retryCount}/3)`;
    } else if (status === 'active' && isPolling) {
      return 'Active'; // Service is running, connection should be active
    } else if (status === 'active' && !isPolling) {
      return 'Disconnected'; // Database says active but service not running
    } else if (status === 'error') {
      return 'Connection Error';
    } else if (status === 'paused') {
      return 'Paused';
    } else {
      return 'Disconnected';
    }
  };

  const imapAccounts = smtpAccounts.filter(account => 
    account.imapHost && account.imapUsername
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">IMAP Settings</h2>
        <p className="text-gray-600">Manage inbound email processing and IMAP connections</p>
      </div>

      {/* IMAP Status Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">IMAP Service Status</h3>
          <button
            onClick={() => refetchStatus()}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3">
            <Activity className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-600">Polling Status</p>
              <p className={`text-lg font-semibold ${
                imapStatus?.isPolling ? 'text-green-600' : 'text-red-600'
              }`}>
                {imapStatus?.isPolling ? 'Active' : 'Stopped'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Mail className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-600">Active Connections</p>
              <p className="text-lg font-semibold text-gray-900">
                {imapStatus?.totalConnections || 0}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-sm font-medium text-gray-600">Configured Accounts</p>
              <p className="text-lg font-semibold text-gray-900">
                {imapAccounts.length}
              </p>
            </div>
          </div>
        </div>

        {/* Polling Controls */}
        <div className="mt-6 flex space-x-4">
          <button
            onClick={handleStartPolling}
            disabled={imapStatus?.isPolling || pollingMutation.isLoading}
            className="btn-primary flex items-center disabled:opacity-50"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Polling
          </button>
          <button
            onClick={handleStopPolling}
            disabled={!imapStatus?.isPolling || pollingMutation.isLoading}
            className="btn-secondary flex items-center disabled:opacity-50"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Polling
          </button>
        </div>
      </div>

      {/* Clear Demo Data */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Clear Demo Data</h3>
        <p className="text-sm text-gray-600 mb-4">
          Remove all demo/dummy emails to see only your real IMAP-fetched emails.
        </p>
        
        <div className="flex space-x-4">
          <button
            onClick={() => clearEmailsMutation.mutate()}
            disabled={clearEmailsMutation.isLoading}
            className="btn-secondary flex items-center disabled:opacity-50"
          >
            {clearEmailsMutation.isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Clear All Emails
          </button>
          
          <button
            onClick={() => resetEmailsMutation.mutate()}
            disabled={resetEmailsMutation.isLoading}
            className="btn-primary flex items-center disabled:opacity-50"
          >
            {resetEmailsMutation.isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Reset Email State
          </button>
        </div>
        
        <div className="mt-3 text-xs text-gray-500">
          <p><strong>Clear All Emails:</strong> Removes all emails and logs</p>
          <p><strong>Reset Email State:</strong> Clears emails and stops IMAP polling</p>
        </div>
      </div>

      {/* Account Selection and Testing */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Test IMAP Connection</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select IMAP Account
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="input-field"
            >
              <option value="">Choose an account...</option>
              {imapAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.imapHost})
                </option>
              ))}
            </select>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleTestConnection}
              disabled={!selectedAccount || isTesting}
              className="btn-primary flex items-center disabled:opacity-50"
            >
              {isTesting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </button>

            <button
              onClick={handleFetchEmails}
              disabled={!selectedAccount || isFetching}
              className="btn-secondary flex items-center disabled:opacity-50"
            >
              {isFetching ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Fetch Emails
            </button>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Connection Status</h3>
        
        {!imapStatus || !imapStatus.connections || imapStatus.connections.length === 0 ? (
          <div className="text-center py-8">
            <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No IMAP accounts configured</p>
            <p className="text-sm text-gray-400 mt-2">
              Configure IMAP settings in your email accounts to enable connection status monitoring
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {imapStatus.connections.map((connection) => {
              // Handle invalid dates
              let lastActivityText = 'Never';
              try {
                if (connection.lastActivity && connection.lastActivity !== 'Invalid Date') {
                  const lastActivityDate = new Date(connection.lastActivity);
                  if (!isNaN(lastActivityDate.getTime())) {
                    lastActivityText = lastActivityDate.toLocaleString();
                  }
                }
              } catch (e) {
                console.warn('Invalid lastActivity date:', connection.lastActivity);
              }

              return (
                <div
                  key={connection.accountId}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    connection.isConnected 
                      ? 'bg-green-50 border border-green-200' 
                      : connection.status === 'active'
                      ? 'bg-yellow-50 border border-yellow-200'
                      : connection.status === 'error'
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(connection.isConnected, connection.status)}
                    <div>
                      <p className="font-medium text-gray-900">
                        {connection.accountName || connection.accountEmail || connection.imapHost || 'Unknown Account'}
                      </p>
                      {(connection.accountEmail || connection.imapHost) && (
                        <p className="text-xs text-gray-500">
                          {connection.accountEmail || connection.imapHost}
                        </p>
                      )}
                      <p className="text-sm text-gray-600">
                        {getStatusText(connection.isConnected, connection.retryCount || 0, connection.status, imapStatus?.isPolling)}
                      </p>
                      {connection.errorMessage && (
                        <p className="text-xs text-red-600 mt-1">
                          Error: {connection.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      Last Activity: {lastActivityText}
                    </p>
                    {connection.retryCount > 0 && (
                      <p className="text-sm text-orange-600">
                        Retry Count: {connection.retryCount}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* IMAP Configuration Help */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">IMAP Configuration Help</h3>
        
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Gmail Configuration:</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>IMAP Host: imap.gmail.com</li>
              <li>IMAP Port: 993</li>
              <li>Security: SSL</li>
              <li>Use App Password (not regular password)</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Outlook/Hotmail Configuration:</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>IMAP Host: outlook.office365.com</li>
              <li>IMAP Port: 993</li>
              <li>Security: SSL</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Yahoo Configuration:</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>IMAP Host: imap.mail.yahoo.com</li>
              <li>IMAP Port: 993</li>
              <li>Security: SSL</li>
              <li>Use App Password</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImapSettings;
