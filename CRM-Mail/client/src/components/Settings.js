import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Plus,
  Edit,
  Trash2,
  TestTube,
  Mail,
  Server,
  Users,
  Shield,
  Inbox,
  CheckCircle2,
  Zap,
  Activity,
  Clock,
  Send,
  AlertCircle,
  Info
} from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import ImapSettings from './ImapSettings';
import { useAuth } from '../contexts/AuthContext';

const deriveSecurityOption = (securityValue, secureFlag, fallback = 'tls') => {
  if (typeof securityValue === 'string' && securityValue.length > 0) {
    return securityValue;
  }
  if (secureFlag === false) {
    return 'none';
  }
  return fallback;
};

const boolFromSecurityOption = (option) => option !== 'none';

const mapAccountToFormData = (account = {}, defaultOwnerId = '') => ({
  id: account.id,
  name: account.name || '',
  host: account.host || account.smtpHost || '',
  port: account.port || account.smtpPort || 587,
  security: deriveSecurityOption(account.security, account.smtpSecure),
  username: account.username || account.smtpUsername || '',
  password: account.password || account.smtpPassword || '',
  fromEmail: account.fromEmail || account.email || '',
  ownerId: account.ownerId || account.createdBy || defaultOwnerId || '',
  type: account.type || 'both',
  imapHost: account.imapHost || '',
  imapPort: account.imapPort || 993,
  imapSecurity: deriveSecurityOption(account.imapSecurity, account.imapSecure, 'ssl'),
  imapUsername: account.imapUsername || account.smtpUsername || '',
  imapPassword: account.imapPassword || '',
  imapFolder: account.imapFolder || 'INBOX'
});

const mapFormDataToPayload = (formData, { defaultOwnerId = null } = {}) => {
  const port = Number(formData.port) || 587;
  const imapPort = Number(formData.imapPort) || 993;
  const smtpSecure = boolFromSecurityOption(formData.security);
  const imapSecure = boolFromSecurityOption(formData.imapSecurity);

  const payload = {
    name: formData.name,
    email: formData.fromEmail,
    fromEmail: formData.fromEmail,
    type: formData.type || 'both',
    host: formData.host,
    smtpHost: formData.host,
    port,
    smtpPort: port,
    security: formData.security,
    smtpSecure,
    smtpAuth: true,
    username: formData.username,
    smtpUsername: formData.username,
    ownerId: formData.ownerId || defaultOwnerId || null,
    imapHost: formData.imapHost,
    imapPort,
    imapSecurity: formData.imapSecurity,
    imapSecure,
    imapUsername: formData.imapUsername,
    imapFolder: formData.imapFolder
  };

  if (typeof formData.password === 'string' && formData.password.length > 0) {
    payload.password = formData.password;
    payload.smtpPassword = formData.password;
  }

  if (typeof formData.imapPassword === 'string' && formData.imapPassword.length > 0) {
    payload.imapPassword = formData.imapPassword;
  }

  return payload;
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState('smtp');
  const [showAddSmtpModal, setShowAddSmtpModal] = useState(false);
  const [showEditSmtpModal, setShowEditSmtpModal] = useState(false);
  const [selectedSmtp, setSelectedSmtp] = useState(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [accountToSwitch, setAccountToSwitch] = useState(null);
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const isCeo = (user?.role || '').toLowerCase() === 'ceo';
  const queryClient = useQueryClient();

  const { data: smtpAccounts, isLoading: smtpLoading } = useQuery('smtp-accounts', async () => {
    const response = await axios.get('/api/smtp-accounts');
    return response.data;
  });

  // Fetch usage statistics for each account
  const { data: usageStats, refetch: refetchUsageStats } = useQuery(
    ['smtp-usage', smtpAccounts?.map(a => a.id)],
    async () => {
      if (!smtpAccounts || smtpAccounts.length === 0) return {};
      const stats = {};
      await Promise.all(
        smtpAccounts.map(async (account) => {
          try {
            const response = await axios.get(`/api/smtp-accounts/${account.id}/usage`);
            stats[account.id] = response.data;
          } catch (error) {
            console.error(`Failed to fetch usage for account ${account.id}:`, error);
            stats[account.id] = null;
          }
        })
      );
      return stats;
    },
    {
      enabled: !!smtpAccounts && smtpAccounts.length > 0,
      refetchInterval: 30000 // Refetch every 30 seconds
    }
  );

  const [syncProgress, setSyncProgress] = useState(null);
  const [progressPolling, setProgressPolling] = useState(null);

  const addSmtpMutation = useMutation(async (smtpData) => {
    const response = await axios.post('/api/smtp-accounts', smtpData);
    return response.data;
  }, {
    onSuccess: (data) => {
      queryClient.invalidateQueries('smtp-accounts');
      setShowAddSmtpModal(false);
      
      // If account has IMAP and is syncing, show progress
      if (data.data?.syncProgress && (data.data.syncProgress.status === 'syncing' || data.data.syncProgress.status === 'idle')) {
        setSyncProgress({
          accountId: data.data.id,
          accountName: data.data.name,
          ...data.data.syncProgress
        });
        
        // Start polling for progress updates
        const pollInterval = setInterval(async () => {
          try {
            const progressResponse = await axios.get(`/api/smtp-accounts/${data.data.id}/sync-progress`);
            const account = progressResponse.data;
            
            // Update progress if available
            if (account.progress) {
              setSyncProgress({
                accountId: data.data.id,
                accountName: data.data.name,
                ...account.progress
              });
            }
            
            // Check if sync is complete (use 'active' instead of 'connected' - enum only allows: active, paused, error, disconnected)
            if (account.syncStatus === 'active' || account.syncStatus === 'error') {
              // Only stop polling if progress shows completed/error, not just because status is active
              if (account.progress && (account.progress.status === 'completed' || account.progress.status === 'error')) {
              clearInterval(pollInterval);
              setProgressPolling(null);
              
              // Show final progress state
              if (account.progress) {
                setSyncProgress({
                  accountId: data.data.id,
                  accountName: data.data.name,
                  ...account.progress
                });
                
                // Clear after 5 seconds
                setTimeout(() => {
                  setSyncProgress(null);
                }, 5000);
              } else {
                setSyncProgress(null);
              }
              
                if (account.syncStatus === 'active' && account.progress?.status === 'completed') {
                  toast.success(`Account "${data.data.name}" activated and synced successfully`);
                } else if (account.syncStatus === 'error' || account.progress?.status === 'error') {
                  toast.error(`Account "${data.data.name}" sync failed: ${account.errorMessage || account.progress?.message || 'Unknown error'}`);
                }
                
                queryClient.invalidateQueries('smtp-accounts');
              }
            }
          } catch (error) {
            console.error('Error polling sync progress:', error);
          }
        }, 2000); // Poll every 2 seconds
        
        setProgressPolling(pollInterval);
        
        // Clear polling after 5 minutes max
        setTimeout(() => {
          if (pollInterval) {
            clearInterval(pollInterval);
            setProgressPolling(null);
            setSyncProgress(null);
          }
        }, 300000);
      } else {
        toast.success('SMTP account added and activated successfully');
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to add SMTP account');
      if (progressPolling) {
        clearInterval(progressPolling);
        setProgressPolling(null);
      }
      setSyncProgress(null);
    }
  });

  const testSmtpMutation = useMutation(async (smtpId) => {
    const response = await axios.post(`/api/smtp-accounts/${smtpId}/test`);
    return response.data;
  }, {
    onSuccess: () => {
      toast.success('SMTP connection test successful');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'SMTP connection test failed');
    }
  });

  const updateSmtpMutation = useMutation(async ({ id, data }) => {
    const response = await axios.put(`/api/smtp-accounts/${id}`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('smtp-accounts');
      setShowEditSmtpModal(false);
      setSelectedSmtp(null);
      toast.success('SMTP account updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update SMTP account');
    }
  });

  const deleteSmtpMutation = useMutation(async (id) => {
    const response = await axios.delete(`/api/smtp-accounts/${id}`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('smtp-accounts');
      toast.success('SMTP account deleted');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete SMTP account');
    }
  });

  const setPriorityMutation = useMutation(async ({ id, priority }) => {
    const response = await axios.post(`/api/smtp-accounts/${id}/set-priority`, { priority });
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('smtp-accounts');
      queryClient.invalidateQueries('smtp-usage');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update priority');
    }
  });

  const toggleActiveMutation = useMutation(async ({ id, isActive }) => {
    const response = await axios.put(`/api/smtp-accounts/${id}`, { isActive });
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('smtp-accounts');
      toast.success('SMTP account updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update SMTP account');
    }
  });

  const tabs = [
    { id: 'smtp', name: 'SMTP Accounts', icon: Mail },
    { id: 'imap', name: 'IMAP Settings', icon: Inbox },
    { id: 'security', name: 'Security', icon: Shield }
  ];

  const handleEditSmtp = (smtp) => {
    setSelectedSmtp(smtp);
    setShowEditSmtpModal(true);
  };

  const handleTestSmtp = (smtpId) => {
    testSmtpMutation.mutate(smtpId);
  };

  const sortedSmtpAccounts = React.useMemo(() => {
    if (!Array.isArray(smtpAccounts)) return [];
    return [...smtpAccounts].sort((a, b) => {
      const priorityA = a.sendPriority ?? 1000;
      const priorityB = b.sendPriority ?? 1000;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdAtA - createdAtB;
    });
  }, [smtpAccounts]);

  const groupedSmtpAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(sortedSmtpAccounts) ? sortedSmtpAccounts : [];
    const shared = accountsArray.filter(account => account.isSystemAccount);
    const myAccounts = accountsArray.filter(account => !account.isSystemAccount && account.ownerId === currentUserId);
    const otherPrivate = accountsArray.filter(account => !account.isSystemAccount && account.ownerId && account.ownerId !== currentUserId);
    return { shared, my: myAccounts, others: otherPrivate };
  }, [sortedSmtpAccounts, currentUserId]);

  const tableSections = React.useMemo(() => {
    const sections = [];
    if (groupedSmtpAccounts.shared.length > 0) {
      sections.push({
        key: 'shared',
        label: 'Organization Accounts',
        description: 'Configured by CEOs and available to conferences they’re mapped to',
        accounts: groupedSmtpAccounts.shared
      });
    }
    if (groupedSmtpAccounts.my.length > 0) {
      sections.push({
        key: 'mine',
        label: 'My Accounts',
        description: 'Only visible to you',
        accounts: groupedSmtpAccounts.my
      });
    }
    if (isCeo && groupedSmtpAccounts.others.length > 0) {
      sections.push({
        key: 'others',
        label: 'Team Members’ Private Accounts',
        description: 'Visible to CEOs for oversight',
        accounts: groupedSmtpAccounts.others
      });
    }
    return sections;
  }, [groupedSmtpAccounts, isCeo]);

  // Get currently active primary SMTP (the one being used)
  const activePrimarySmtp = React.useMemo(() => {
    return sortedSmtpAccounts.find(account => 
      account.isActive && account.sendPriority === 1
    );
  }, [sortedSmtpAccounts]);

  const handleSetPrimary = (account) => {
    if (!isCeo) {
      toast.error('Only CEOs can switch the primary follow-up account');
      return;
    }
    if (activePrimarySmtp?.id === account.id) {
      toast.info('This account is already the primary account');
      return;
    }
    setAccountToSwitch(account);
    setShowSwitchConfirm(true);
  };

  const confirmSwitchPrimary = () => {
    if (accountToSwitch) {
      setPriorityMutation.mutate({ id: accountToSwitch.id, priority: 1 }, {
        onSuccess: () => {
          refetchUsageStats();
          toast.success(`"${accountToSwitch.name}" is now the primary account for follow-ups`);
        }
      });
    }
    setShowSwitchConfirm(false);
    setAccountToSwitch(null);
  };

  const handleToggleActive = (account) => {
    toggleActiveMutation.mutate({ id: account.id, isActive: !account.isActive });
  };

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (progressPolling) {
        clearInterval(progressPolling);
      }
    };
  }, [progressPolling]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage SMTP accounts, inbound email sync, and security for your organization.</p>
      </div>
      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
        SMTP accounts are owned by individual users and are automatically synced. CEOs can see and manage all accounts, while TeamLeads and Members only see and use accounts that are mapped to conferences assigned to them.
      </div>

      {/* Sync Progress Banner */}
      {syncProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {syncProgress.status === 'syncing' ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              ) : syncProgress.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {syncProgress.status === 'syncing' ? 'Activating & Syncing Account' : 
                     syncProgress.status === 'completed' ? 'Account Activated & Synced' : 
                     'Sync Error'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {syncProgress.accountName}
                  </p>
                  {syncProgress.status === 'syncing' && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-600">{syncProgress.message}</p>
                      {syncProgress.totalEmails > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>Syncing emails...</span>
                            <span>{syncProgress.emailsSynced} / {syncProgress.totalEmails}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${(syncProgress.emailsSynced / syncProgress.totalEmails) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {syncProgress.status === 'completed' && (
                    <p className="text-xs text-green-600 mt-1">{syncProgress.message}</p>
                  )}
                  {syncProgress.status === 'error' && (
                    <p className="text-xs text-red-600 mt-1">{syncProgress.message}</p>
                  )}
                </div>
                {syncProgress.status === 'completed' || syncProgress.status === 'error' ? (
                  <button
                    onClick={() => {
                      setSyncProgress(null);
                      if (progressPolling) {
                        clearInterval(progressPolling);
                        setProgressPolling(null);
                      }
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-5 w-5 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* SMTP Accounts Tab */}
      {activeTab === 'smtp' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900">SMTP Accounts</h2>
              <p className="text-sm text-gray-600">Configure email sending accounts</p>
              {activePrimarySmtp && (
                <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <Zap className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-semibold text-gray-900">Active for Follow-ups</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">{activePrimarySmtp.name}</span> ({activePrimarySmtp.email})
                        </p>
                        {usageStats && usageStats[activePrimarySmtp.id] && (
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-600">
                            {usageStats[activePrimarySmtp.id].sentToday > 0 && (
                              <span className="flex items-center space-x-1">
                                <Send className="h-3 w-3" />
                                <span>{usageStats[activePrimarySmtp.id].sentToday} sent today</span>
                              </span>
                            )}
                            {usageStats[activePrimarySmtp.id].lastUsed && (
                              <span className="flex items-center space-x-1">
                                <Clock className="h-3 w-3" />
                                <span>Last used: {new Date(usageStats[activePrimarySmtp.id].lastUsed).toLocaleString()}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Info
                        className="h-4 w-4 text-gray-400"
                        title="This is the default SMTP account for conferences that don't have their own SMTP mapped. Individual conferences can now choose a specific SMTP in the Create/Edit Conference form."
                      />
                    </div>
                  </div>
                  {!isCeo && (
                    <p className="text-xs text-gray-500 mt-2">
                      Only CEOs can switch the primary follow-up account. Conferences with a specific SMTP mapped will always use that account.
                    </p>
                  )}
                </div>
              )}
            </div>
            {isCeo && (
              <button
                onClick={() => setShowAddSmtpModal(true)}
                className="btn-primary flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add SMTP Account
              </button>
            )}
          </div>

          {/* List View */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-[1100px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visibility</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Host</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {smtpLoading ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-8 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : tableSections.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                      <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p>No SMTP accounts configured or accessible</p>
                    </td>
                  </tr>
                ) : (
                  tableSections.map((section) => (
                    <React.Fragment key={section.key}>
                      <tr className="bg-gray-50/70">
                        <td colSpan="9" className="px-6 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          <div className="flex items-center justify-between">
                            <span>{section.label}</span>
                            <span className="text-gray-400 normal-case font-normal">{section.description}</span>
                          </div>
                        </td>
                      </tr>
                      {section.accounts.map((account) => {
                        const isCurrentlyActive = activePrimarySmtp?.id === account.id;
                        const accountStats = usageStats?.[account.id];
                        const isActive = account.isActive;
                        const isSharedAccount = account.isSystemAccount;
                        const isMine = account.ownerId === currentUserId;
                        const ownerName = account.owner?.name || account.creator?.name || '';
                        const visibilityLabel = isSharedAccount
                          ? 'Shared (System)'
                          : isMine
                          ? 'My Account'
                          : 'Private';
                        const visibilityBadgeClass = isSharedAccount
                          ? 'bg-blue-100 text-blue-800'
                          : isMine
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700';
                        // Only CEO can manage SMTP accounts (edit/delete/toggle/primary)
                        const canManageAccount = isCeo;
                        const canSetPrimary = isCeo && !isCurrentlyActive && isActive;

                        return (
                          <tr key={account.id} className={isCurrentlyActive ? 'bg-green-50 border-l-4 border-l-green-500' : 'hover:bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {isCurrentlyActive ? (
                                <div className="flex flex-col space-y-1">
                                  <div className="flex items-center space-x-1">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span className="text-xs text-green-600 font-semibold">Active for Follow-ups</span>
                                  </div>
                                  {accountStats && (
                                    <div className="text-xs text-gray-500">
                                      {accountStats.sentToday || 0} today
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col space-y-1">
                                  <span className={`px-2 py-1 text-xs rounded-full inline-block ${
                                    account.sendPriority === 1 
                                      ? 'bg-blue-100 text-blue-800' 
                                      : account.sendPriority === 2
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {account.sendPriority === 1 ? 'Primary' : account.sendPriority === 2 ? 'Secondary' : `Priority ${account.sendPriority}`}
                                  </span>
                                  {!isActive && (
                                    <span className="text-xs text-gray-400">Paused</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{account.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${visibilityBadgeClass}`}>
                                {visibilityLabel}
                              </div>
                              {!isSharedAccount && !isMine && ownerName && (
                                <p className="text-[11px] text-gray-500 mt-1">Owner: {ownerName}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{account.email || account.fromEmail}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{account.smtpHost || account.host}:{account.smtpPort || account.port}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{account.sendPriority ?? '—'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{account.type?.toUpperCase() || 'BOTH'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={() => canManageAccount && handleToggleActive(account)}
                                disabled={toggleActiveMutation.isLoading || !canManageAccount}
                                className={`px-2 py-1 text-xs rounded ${
                                  account.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-500'
                                } ${(!canManageAccount || toggleActiveMutation.isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-200'}`}
                              >
                                {account.isActive ? 'Active' : 'Paused'}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-2">
                                {canSetPrimary && (
                                  <button
                                    onClick={() => handleSetPrimary(account)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                    title="Set as Primary for Follow-ups"
                                  >
                                    <Zap className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleTestSmtp(account.id)}
                                  className="text-gray-400 hover:text-gray-600"
                                  title="Test Connection"
                                >
                                  <TestTube className="h-4 w-4" />
                                </button>
                                {canManageAccount && (
                                  <>
                                    <button
                                      onClick={() => handleEditSmtp(account)}
                                      className="text-gray-400 hover:text-gray-600"
                                      title="Edit"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => deleteSmtpMutation.mutate(account.id)}
                                      className="text-gray-400 hover:text-red-600"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMAP Settings Tab */}
      {activeTab === 'imap' && (
        <ImapSettings />
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Security Settings</h2>
            <p className="text-sm text-gray-600">Configure security and compliance settings</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Email Security</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">SSL/TLS Encryption</p>
                    <p className="text-sm text-gray-600">Encrypt email connections</p>
                  </div>
                  <span className="status-badge bg-green-100 text-green-800">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Password Encryption</p>
                    <p className="text-sm text-gray-600">Encrypt stored passwords</p>
                  </div>
                  <span className="status-badge bg-green-100 text-green-800">Enabled</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Compliance</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Unsubscribe Links</p>
                    <p className="text-sm text-gray-600">Include unsubscribe in emails</p>
                  </div>
                  <span className="status-badge bg-green-100 text-green-800">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Audit Logging</p>
                    <p className="text-sm text-gray-600">Log all admin actions</p>
                  </div>
                  <span className="status-badge bg-green-100 text-green-800">Enabled</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add SMTP Modal */}
      <Transition appear show={showAddSmtpModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowAddSmtpModal(false)}>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                    Add SMTP Account
                  </Dialog.Title>
                  
                  <SmtpForm 
                    onSubmit={(data) => addSmtpMutation.mutate(data)}
                    onCancel={() => setShowAddSmtpModal(false)}
                    loading={addSmtpMutation.isLoading}
                    canManageSystemAccount={isCeo}
                    currentUser={user}
                  />
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Switch Primary Account Confirmation Modal */}
      <Transition appear show={showSwitchConfirm} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowSwitchConfirm(false)}>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4 flex items-center space-x-2">
                    <Zap className="h-5 w-5 text-blue-600" />
                    <span>Switch Primary SMTP Account</span>
                  </Dialog.Title>
                  
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-gray-700">
                          <p className="font-medium text-gray-900 mb-1">Safe to Switch</p>
                          <p>Switching the primary account won't interrupt existing follow-up sequences. Future emails will automatically use the new primary account.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Current Primary:</p>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="font-medium text-gray-900">{activePrimarySmtp?.name}</p>
                        <p className="text-xs text-gray-500">{activePrimarySmtp?.email}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">New Primary:</p>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <p className="font-medium text-gray-900">{accountToSwitch?.name}</p>
                        <p className="text-xs text-gray-500">{accountToSwitch?.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSwitchConfirm(false);
                        setAccountToSwitch(null);
                      }}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmSwitchPrimary}
                      disabled={setPriorityMutation.isLoading}
                      className="btn-primary flex items-center space-x-2"
                    >
                      {setPriorityMutation.isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Switching...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          <span>Switch to Primary</span>
                        </>
                      )}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Edit SMTP Modal */}
      <Transition appear show={showEditSmtpModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowEditSmtpModal(false)}>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                    Edit SMTP Account
                  </Dialog.Title>
                  
                  <SmtpForm
                    initialData={selectedSmtp}
                    onSubmit={(data) => updateSmtpMutation.mutate({ id: selectedSmtp.id, data })}
                    onCancel={() => setShowEditSmtpModal(false)}
                    loading={updateSmtpMutation.isLoading}
                    canManageSystemAccount={isCeo}
                    currentUser={user}
                  />
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

const SmtpForm = ({ onSubmit, onCancel, loading, initialData, canManageSystemAccount, currentUser }) => {
  const defaultOwnerId = currentUser?.id || '';
  const [formData, setFormData] = useState(mapAccountToFormData(initialData || {}, defaultOwnerId));
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(mapAccountToFormData(initialData, defaultOwnerId));
    } else {
      setFormData(mapAccountToFormData({}, defaultOwnerId));
    }
    setShowSmtpPassword(false);
    setShowImapPassword(false);
  }, [initialData, defaultOwnerId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(mapFormDataToPayload(formData, { defaultOwnerId }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Account Name
        </label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          className="input-field"
          placeholder="e.g., Gmail SMTP"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Host
          </label>
          <input
            type="text"
            name="host"
            required
            value={formData.host}
            onChange={handleChange}
            className="input-field"
            placeholder="smtp.gmail.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Port
          </label>
          <input
            type="number"
            name="port"
            required
            value={formData.port}
            onChange={handleChange}
            className="input-field"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Security
        </label>
        <select
          name="security"
          value={formData.security}
          onChange={handleChange}
          className="input-field"
        >
          <option value="none">None</option>
          <option value="tls">TLS</option>
          <option value="ssl">SSL</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          type="text"
          name="username"
          required
          value={formData.username}
          onChange={handleChange}
          className="input-field"
          placeholder="your-email@gmail.com"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <div className="relative">
          <input
            type={showSmtpPassword ? 'text' : 'password'}
            name="password"
            required={!initialData}
            value={formData.password ?? ''}
            onChange={handleChange}
            className="input-field pr-24"
            placeholder="App password or account password"
          />
          <button
            type="button"
            onClick={() => setShowSmtpPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-primary-600 hover:text-primary-800 focus:outline-none"
          >
            {showSmtpPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          From Email
        </label>
        <input
          type="email"
          name="fromEmail"
          required
          value={formData.fromEmail}
          onChange={handleChange}
          className="input-field"
          placeholder="your-email@gmail.com"
        />
      </div>
      <input type="hidden" name="ownerId" value={formData.ownerId || defaultOwnerId} />

      {/* IMAP Settings */}
      <div className="mt-6">
        <h4 className="text-md font-medium text-gray-900 mb-3">Inbound Email (IMAP)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host</label>
            <input
              type="text"
              name="imapHost"
              value={formData.imapHost}
              onChange={handleChange}
              className="input-field"
              placeholder="imap.gmail.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Port</label>
            <input
              type="number"
              name="imapPort"
              value={formData.imapPort}
              onChange={handleChange}
              className="input-field"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Security</label>
            <select
              name="imapSecurity"
              value={formData.imapSecurity}
              onChange={handleChange}
              className="input-field"
            >
              <option value="none">None</option>
              <option value="tls">TLS</option>
              <option value="ssl">SSL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Folder</label>
            <input
              type="text"
              name="imapFolder"
              value={formData.imapFolder}
              onChange={handleChange}
              className="input-field"
              placeholder="INBOX"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Username</label>
            <input
              type="text"
              name="imapUsername"
              value={formData.imapUsername}
              onChange={handleChange}
              className="input-field"
              placeholder="your-email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Password</label>
            <div className="relative">
              <input
                type={showImapPassword ? 'text' : 'password'}
                name="imapPassword"
                value={formData.imapPassword}
                onChange={handleChange}
                className="input-field pr-24"
                placeholder="App password or password"
              />
              <button
                type="button"
                onClick={() => setShowImapPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-primary-600 hover:text-primary-800 focus:outline-none"
              >
                {showImapPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? (initialData ? 'Saving...' : 'Adding...') : (initialData ? 'Save Changes' : 'Add Account')}
        </button>
      </div>
    </form>
  );
};

export default Settings;
