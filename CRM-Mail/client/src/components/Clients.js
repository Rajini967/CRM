import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  UserPlusIcon,
  CheckIcon,
  XMarkIcon,
  CalendarIcon,
  MapPinIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  ArrowUpTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const Clients = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Full country list for searchable country picker in Add/Edit form
  const ALL_COUNTRIES = useMemo(() => ([
    'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria','Azerbaijan',
    'Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi',
    'Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo (Congo-Brazzaville)','Costa Rica','Côte d’Ivoire','Croatia','Cuba','Cyprus','Czechia (Czech Republic)',
    'Democratic Republic of the Congo','Denmark','Djibouti','Dominica','Dominican Republic',
    'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini (fmr. "Swaziland")','Ethiopia',
    'Fiji','Finland','France',
    'Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana',
    'Haiti','Holy See','Honduras','Hungary',
    'Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
    'Jamaica','Japan','Jordan',
    'Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
    'Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
    'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar (formerly Burma)',
    'Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway',
    'Oman',
    'Pakistan','Palau','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal',
    'Qatar',
    'Romania','Russia','Rwanda',
    'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria',
    'Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu',
    'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States of America','Uruguay','Uzbekistan',
    'Vanuatu','Venezuela','Vietnam',
    'Yemen',
    'Zambia','Zimbabwe'
  ]), []);

  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [countryFilter, setCountryFilter] = useState('All Countries');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [dateAddedFrom, setDateAddedFrom] = useState('');
  const [dateAddedTo, setDateAddedTo] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedClients, setSelectedClients] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // table, grid, cards
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [showBulkConferenceModal, setShowBulkConferenceModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkConferenceId, setBulkConferenceId] = useState('');
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  // Country combobox state (declared after formData below)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    country: '',
    status: 'Lead',
    currentStage: 'stage1',
    conferenceId: '',
    notes: '',
    manualStage1Count: 0,
    manualStage2Count: 0,
    // Optional: Message-ID of the first manual email sent outside CRM.
    // When provided, all automated follow-ups will reply to this message.
    threadRootMessageId: '',
    // Optional: Subject of the first manual email (e.g., "Re: Invitation ...").
    // When provided, follow-ups will use this subject (with "Re:") to improve Gmail threading.
    initialEmailSubject: ''
  });

  // Country combobox state (Add/Edit modal only) - placed after formData so it can read formData.country safely
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const countryRef = useRef(null);
  const filteredCountries = useMemo(() => {
    const q = (countryQuery || formData.country || '').trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(c => c.toLowerCase().includes(q));
  }, [ALL_COUNTRIES, countryQuery, formData.country]);

  // Close country dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (countryRef.current && !countryRef.current.contains(e.target)) {
        setCountryDropdownOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setCountryDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Fetch clients with advanced filtering
  const [emailActivityFilter, setEmailActivityFilter] = useState('all');
  const { data: clientsData, isLoading, error: clientsError, refetch } = useQuery(
    ['clients', conferenceFilter, statusFilter, countryFilter, searchTerm, sortBy, sortOrder, emailActivityFilter, dateAddedFrom, dateAddedTo, currentPage, pageSize],
    async () => {
      try {
        const params = new URLSearchParams();
        if (conferenceFilter) params.append('conferenceId', conferenceFilter);
        if (statusFilter && statusFilter !== 'All Statuses') params.append('status', statusFilter);
        if (countryFilter && countryFilter !== 'All Countries') params.append('country', countryFilter);
        if (searchTerm) params.append('search', searchTerm.trim().substring(0, 200)); // Sanitize search
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
        if (emailActivityFilter === 'today') params.append('emailFilter', 'today');
        if (emailActivityFilter === 'upcoming') params.append('emailFilter', 'upcoming');
        if (dateAddedFrom) params.append('dateAddedFrom', dateAddedFrom);
        if (dateAddedTo) params.append('dateAddedTo', dateAddedTo);
        params.append('page', currentPage);
        params.append('limit', pageSize);
        
        const response = await axios.get(`/api/clients?${params.toString()}`);
        console.log('Clients API response:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error fetching clients:', error);
        // Return empty data structure instead of throwing to prevent infinite loading
        return { clients: [], total: 0, page: 1, limit: 50, totalPages: 0 };
      }
    },
    {
      retry: 1, // Only retry once
      staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
      onError: (error) => {
        console.error('Client query error:', error);
        toast.error('Failed to load clients. Please try again.');
      },
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      // For Members, enable focus refetch for immediate updates when switching back to browser
      refetchOnWindowFocus: user?.role === 'Member',
    }
  );

  // Fetch conferences for filter
  const { data: conferences } = useQuery('conferences', async () => {
    try {
      const response = await axios.get('/api/conferences');
      return response.data;
    } catch (error) {
      console.error('Error fetching conferences:', error);
      return []; // Return empty array on error
    }
  }, {
    retry: 1,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    // Ensure newly assigned conferences appear immediately for Members when switching back to browser
    refetchOnWindowFocus: user?.role === 'Member',
  });

  // Ensure clients is always an array and extract pagination info
  const clients = useMemo(() => {
    if (!clientsData) return [];
    if (Array.isArray(clientsData)) return clientsData;
    if (clientsData && typeof clientsData === 'object' && clientsData.clients && Array.isArray(clientsData.clients)) {
      return clientsData.clients;
    }
    if (clientsData && typeof clientsData === 'object' && clientsData.data && Array.isArray(clientsData.data)) {
      return clientsData.data;
    }
    console.warn('Clients data is not an array:', clientsData);
    return [];
  }, [clientsData]);

  // Extract pagination info
  const pagination = useMemo(() => {
    if (!clientsData || typeof clientsData !== 'object') {
      return { total: 0, page: 1, limit: pageSize, totalPages: 0 };
    }
    return {
      total: clientsData.total || 0,
      page: clientsData.page || currentPage,
      limit: clientsData.limit || pageSize,
      totalPages: clientsData.totalPages || Math.ceil((clientsData.total || 0) / (clientsData.limit || pageSize))
    };
  }, [clientsData, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [conferenceFilter, statusFilter, countryFilter, searchTerm, emailActivityFilter, dateAddedFrom, dateAddedTo]);

  // Get unique countries for filter
  const countries = useMemo(() => {
    const uniqueCountries = [...new Set(clients.map(client => client.country).filter(Boolean))];
    return uniqueCountries.sort();
  }, [clients]);

  // Status options
  const statusOptions = [
    'All Statuses',
    'Lead',
    'Abstract Submitted',
    'Registered',
    'Unresponsive', // Backend value - displayed as "Declined" in UI
    'Registration Unresponsive',
    'Rejected',
    'Completed'
  ];

  // Helper function to map backend status to display label
  const getStatusDisplayLabel = (status) => {
    if (status === 'Unresponsive') return 'Declined';
    return status;
  };

  // Sort options
  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'country', label: 'Country' },
    { value: 'status', label: 'Status' },
    { value: 'createdAt', label: 'Date Added' },
    { value: 'lastContact', label: 'Last Contact' }
  ];

  // Mutations
  const createClientMutation = useMutation(
    async (clientData) => {
      console.log('Sending client data to server:', clientData);
    const response = await axios.post('/api/clients', clientData);
    return response.data;
    },
    {
    onSuccess: () => {
      queryClient.invalidateQueries('clients');
        toast.success('Client created successfully');
        setShowAddForm(false);
        resetForm();
    },
    onError: (error) => {
        console.error('Client creation error:', error);
        console.error('Error response:', error.response?.data);
        toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to create client');
      }
    }
  );

  const updateClientMutation = useMutation(
    async ({ id, ...clientData }) => {
      const response = await axios.put(`/api/clients/${id}`, clientData);
    return response.data;
    },
    {
    onSuccess: () => {
      queryClient.invalidateQueries('clients');
      toast.success('Client updated successfully');
        setShowEditForm(false);
        setSelectedClient(null);
        resetForm();
    },
    onError: (error) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to update client';
        toast.error(errorMessage);
      }
    }
  );

  const deleteClientMutation = useMutation(
    async (id) => {
      await axios.delete(`/api/clients/${id}`);
    },
    {
    onSuccess: () => {
      queryClient.invalidateQueries('clients');
        toast.success('Client deleted successfully');
    },
    onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to delete client');
      }
    }
  );

  const bulkDeleteMutation = useMutation(
    async (ids) => {
      await axios.post('/api/clients/bulk-delete', { ids });
    },
    {
    onSuccess: () => {
      queryClient.invalidateQueries('clients');
        toast.success(`${selectedClients.length} clients deleted successfully`);
        setSelectedClients([]);
        setShowBulkActions(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to delete clients');
      }
    }
  );

  const bulkStatusMutation = useMutation(
    async ({ ids, status }) => {
      const response = await axios.post('/api/clients/bulk-status', { ids, status });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('clients');
        toast.success(data.message);
        setSelectedClients([]);
        setShowBulkStatusModal(false);
        setBulkStatus('');
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to update client status');
      }
    }
  );

  const bulkConferenceMutation = useMutation(
    async ({ ids, conferenceId }) => {
      const response = await axios.post('/api/clients/bulk-assign-conference', { ids, conferenceId });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('clients');
        toast.success(data.message);
        setSelectedClients([]);
        setShowBulkConferenceModal(false);
        setBulkConferenceId('');
    },
    onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to assign clients to conference');
      }
    }
  );

  // Helper functions
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      country: '',
      status: 'Lead',
      currentStage: 'stage1',
      conferenceId: '',
      notes: '',
      manualStage1Count: 0,
      manualStage2Count: 0,
      initialThreadMessageId: '',
      initialThreadSubject: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleManualCountChange = (field) => (e) => {
    const rawValue = e.target.value;
    const parsed = parseInt(rawValue, 10);
    const sanitized = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setFormData(prev => ({ ...prev, [field]: sanitized }));
  };

  const normalizeManualCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form data being submitted:', formData);
    
    // Prepare data for submission
    const stage1Count = normalizeManualCount(formData.manualStage1Count);
    const stage2Count = normalizeManualCount(formData.manualStage2Count);
    const threadRootMessageId =
      typeof formData.threadRootMessageId === 'string'
        ? formData.threadRootMessageId.trim()
        : '';
    const initialEmailSubject =
      typeof formData.initialEmailSubject === 'string'
        ? formData.initialEmailSubject.trim()
        : '';

    const submitData = {
      ...formData,
      manualStage1Count: stage1Count,
      manualStage2Count: stage2Count,
      manualEmailsCount: stage1Count,
      conferenceId: formData.conferenceId || null, // Convert empty string to null
      threadRootMessageId: threadRootMessageId || undefined,
      initialEmailSubject: initialEmailSubject || undefined
    };
    
    if (showEditForm && selectedClient) {
      updateClientMutation.mutate({ id: selectedClient.id, ...submitData });
    } else {
      createClientMutation.mutate(submitData);
    }
  };

  const handleEdit = (client) => {
    setSelectedClient(client);
    const stage1Manual = client.manualStage1Count !== undefined && client.manualStage1Count !== null
      ? normalizeManualCount(client.manualStage1Count)
      : normalizeManualCount(client.manualEmailsCount);
    const stage2Manual = normalizeManualCount(client.manualStage2Count);
    const initialThreadMessageId =
      client.customFields && client.customFields.initialThreadMessageId
        ? String(client.customFields.initialThreadMessageId)
        : '';
    const initialThreadSubject =
      client.customFields && client.customFields.initialEmailSubject
        ? String(client.customFields.initialEmailSubject)
        : '';
    setFormData({
      name: client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim(),
      email: client.email || '',
      country: client.country || '',
      status: client.status || 'Lead',
      currentStage: client.currentStage || 'stage1',
      conferenceId: client.conferenceId || '',
      notes: client.notes || '',
      manualStage1Count: stage1Manual,
      manualStage2Count: stage2Manual,
      threadRootMessageId: initialThreadMessageId,
      initialEmailSubject: initialThreadSubject
    });
    setShowEditForm(true);
  };

  const handleView = (client) => {
    setSelectedClient(client);
    setShowViewModal(true);
  };

  const handleDelete = (client) => {
    if (window.confirm(`Are you sure you want to delete ${client.name || (client.firstName + ' ' + client.lastName)}?`)) {
      deleteClientMutation.mutate(client.id);
    }
  };

  const handleSelectClient = (clientId) => {
    setSelectedClients(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const handleSelectAll = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map(client => client.id));
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedClients.length} clients?`)) {
      bulkDeleteMutation.mutate(selectedClients);
    }
  };

  const handleBulkStatusChange = () => {
    if (!bulkStatus) {
      toast.error('Please select a status');
      return;
    }
    bulkStatusMutation.mutate({ ids: selectedClients, status: bulkStatus });
  };

  const handleBulkConferenceAssignment = () => {
    if (!bulkConferenceId) {
      toast.error('Please select a conference');
      return;
    }
    bulkConferenceMutation.mutate({ ids: selectedClients, conferenceId: bulkConferenceId });
  };

  // Helper function to get conference display name (shortName preferred, fallback to name)
  const getConferenceDisplayName = (conference) => {
    if (!conference) return null;
    return conference.shortName || conference.name || null;
  };

  // Helper component for truncated conference name with tooltip
  const ConferenceNameDisplay = ({ conference, maxLength = 30, className = '' }) => {
    const displayName = getConferenceDisplayName(conference);
    const fullName = conference?.name || '';
    
    if (!displayName) {
      return <span className={`text-gray-400 italic ${className}`}>No Conference</span>;
    }

    const needsTruncation = displayName.length > maxLength;
    const truncatedName = needsTruncation ? `${displayName.substring(0, maxLength)}...` : displayName;
    const tooltipText = fullName && fullName !== displayName ? `${displayName}\n${fullName}` : displayName;

    return (
      <span
        className={`${className} ${needsTruncation ? 'cursor-help' : ''}`}
        title={tooltipText}
        style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {truncatedName}
      </span>
    );
  };

  const handleExport = () => {
    const csvContent = [
      ['Name', 'Email', 'Country', 'Status', 'Conference', 'Date Added'],
      ...clients.map(client => [
        client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim(),
        client.email,
        client.country || '',
        client.status,
        getConferenceDisplayName(client.conference) || '',
        new Date(client.createdAt).toLocaleDateString()
      ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Clients exported successfully');
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get('/api/clients/template/download', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'client-upload-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast.error('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post('/api/clients/bulk-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadResult(response.data.results);
      setSelectedFile(null);
      
      if (response.data.results.success > 0) {
        toast.success(`${response.data.results.success} clients uploaded successfully!`);
        refetch(); // Refresh the clients list
        setTimeout(() => {
          setShowBulkUploadModal(false);
          setUploadResult(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadResult({
        success: 0,
        failed: 0,
        errors: [error.response?.data?.error || error.message]
      });
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Lead': 'bg-blue-100 text-blue-800',
      'Abstract Submitted': 'bg-yellow-100 text-yellow-800',
      'Registered': 'bg-green-100 text-green-800',
      'Unresponsive': 'bg-red-100 text-red-800',
      'Rejected': 'bg-gray-100 text-gray-800',
      'Completed': 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

const getInitialsFromName = (name) => {
  const parts = (name || '').trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <style>{`
        /* Custom scrollbar styling for better UX */
        .client-table-container::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .client-table-container::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 6px;
        }
        .client-table-container::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 6px;
          border: 2px solid #f1f5f9;
        }
        .client-table-container::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
        .client-table-container::-webkit-scrollbar-corner {
          background: #f1f5f9;
        }
        /* Firefox scrollbar */
        .client-table-container {
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 #f1f5f9;
        }
        /* Ensure sticky header works */
        .client-table-container thead th {
          position: sticky;
          top: 0;
          z-index: 10;
        }
      `}</style>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Overview Dashboard</h1>
              <p className="text-gray-600">Manage and track all your clients in one place</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExport}
                className="flex items-center px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
              >
                <DocumentArrowDownIcon className="w-5 h-5 mr-2" />
                Export CSV
              </button>
              <button
                onClick={() => setShowBulkUploadModal(true)}
                className="flex items-center px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
              >
                <ArrowUpTrayIcon className="w-5 h-5 mr-2" />
                Bulk Upload
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Add Client
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="p-2.5 bg-blue-100 rounded-lg">
                  <UserPlusIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900">{pagination.total || clients.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="p-2.5 bg-green-100 rounded-lg">
                  <CheckIcon className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Registered</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {clients.filter(c => c.status === 'Registered').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="p-2.5 bg-yellow-100 rounded-lg">
                  <CalendarIcon className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Abstracts Submitted</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {clients.filter(c => c.status === 'Abstract Submitted').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="p-2.5 bg-red-100 rounded-lg">
                  <XMarkIcon className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Declined</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {clients.filter(c => c.status === 'Unresponsive').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
      </div>

        {/* Filters and Controls */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* Search */}
            <div className="relative" ref={countryRef}>
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {status === 'All Statuses' ? status : getStatusDisplayLabel(status)}
                </option>
              ))}
            </select>

            {/* Country Filter */}
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="All Countries">All Countries</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            {/* Conference Filter */}
            <select
              value={conferenceFilter}
              onChange={(e) => setConferenceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Conferences</option>
              {conferences?.map(conference => (
                <option key={conference.id} value={conference.id}>{conference.name}</option>
              ))}
            </select>

            {/* Email Activity Filter (additive) */}
            <select
              value={emailActivityFilter}
              onChange={(e) => setEmailActivityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Activity</option>
              <option value="today">Emails Sent Today</option>
              <option value="upcoming">Upcoming Emails (7 days)</option>
            </select>
          </div>

          {/* Date Added Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Added From</label>
              <input
                type="date"
                value={dateAddedFrom}
                onChange={(e) => setDateAddedFrom(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Added To</label>
              <input
                type="date"
                value={dateAddedTo}
                onChange={(e) => setDateAddedTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center space-x-4">
              {/* Sort */}
              <div className="flex items-center space-x-2">
                <ArrowsUpDownIcon className="w-5 h-5 text-gray-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* View Mode */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 text-sm rounded ${viewMode === 'table' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 text-sm rounded ${viewMode === 'cards' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}
                >
                  Cards
                </button>
        </div>
      </div>

            {/* Bulk Actions */}
            {selectedClients.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{selectedClients.length} selected</span>
                <button
                  onClick={() => setShowBulkStatusModal(true)}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Change Status
                </button>
                <button
                  onClick={() => setShowBulkConferenceModal(true)}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  Assign Conference
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading clients...</p>
          </div>
        ) : clientsError ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="text-red-500 mb-4">
              <XMarkIcon className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Clients</h3>
            <p className="text-gray-600 mb-4">{clientsError.message}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Try Again
            </button>
          </div>
        ) : clients.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="text-gray-400 mb-4">
              <UserPlusIcon className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Clients Found</h3>
            <p className="text-gray-600 mb-4">
              {conferences && conferences.length === 0 
                ? "You haven't been assigned to any conferences yet. Contact your Team Lead to get access to conference data."
                : "No clients match your current filters. Try adjusting your search criteria or add a new client."
              }
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Add First Client
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="client-table-container overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 450px)', minHeight: '600px' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        checked={selectedClients.length === clients.length && clients.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                      Client
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[150px]">
                      Conference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                      Email Count
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                      Stage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                      Date Added
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedClients.includes(client.id)}
                          onChange={() => handleSelectClient(client.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-9 w-9">
                            <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-primary-700">
                                {getInitialsFromName(client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim())}
                              </span>
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                              {client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900 truncate max-w-[180px]" title={client.email}>
                          {client.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <MapPinIcon className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[100px]">{client.country}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <div className="truncate max-w-[140px]">
                          <ConferenceNameDisplay conference={client.conference} maxLength={20} />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <EnvelopeIcon className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
                          <span className="font-medium">{client.engagement?.emailsSent || 0}</span>
                        </div>
                        {client.followUpCount > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {client.followUpCount} follow-ups
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(client.currentStage)}`}>
                          {getStageName(client.currentStage)}
                        </span>
                        {client.lastEmailSent && (
                          <div className="text-xs text-gray-500 mt-1">
                            Last: {new Date(client.lastEmailSent).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <CalendarIcon className="w-4 h-4 mr-1.5 text-gray-400 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-xs">
                              {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {client.createdAt ? new Date(client.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleView(client)}
                            className="text-blue-600 hover:text-blue-900 p-1.5 rounded hover:bg-blue-50 transition-colors"
                            title="View"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(client)}
                            className="text-indigo-600 hover:text-indigo-900 p-1.5 rounded hover:bg-indigo-50 transition-colors"
                            title="Edit"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(client)}
                            className="text-red-600 hover:text-red-900 p-1.5 rounded hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination - Always visible */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-700 whitespace-nowrap">
                    Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(pagination.page * pagination.limit, pagination.total)}
                    </span>{' '}
                    of <span className="font-medium">{pagination.total}</span> clients
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                  >
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={200}>200 per page</option>
                  </select>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors bg-white"
                    title="First page"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors flex items-center bg-white"
                    title="Previous page"
                  >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" />
                    Previous
                  </button>
                  
                  {/* Page number input for large datasets */}
                  {pagination.totalPages > 10 && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">Page</span>
                      <input
                        type="number"
                        min="1"
                        max={pagination.totalPages}
                        value={pagination.page}
                        onChange={(e) => {
                          const page = Math.max(1, Math.min(pagination.totalPages, parseInt(e.target.value) || 1));
                          setCurrentPage(page);
                        }}
                        className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center bg-white"
                      />
                      <span className="text-sm text-gray-600">of {pagination.totalPages}</span>
                    </div>
                  )}
                  
                  {/* Page number buttons (only show if <= 10 pages) */}
                  {pagination.totalPages <= 10 && (
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: pagination.totalPages }, (_, i) => {
                        const pageNum = i + 1;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              pagination.page === pageNum
                                ? 'bg-primary-600 text-white'
                                : 'border border-gray-300 hover:bg-gray-100 bg-white'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Show page range for > 10 pages */}
                  {pagination.totalPages > 10 && (
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              pagination.page === pageNum
                                ? 'bg-primary-600 text-white'
                                : 'border border-gray-300 hover:bg-gray-100 bg-white'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  <button
                    onClick={() => setCurrentPage(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors flex items-center bg-white"
                    title="Next page"
                  >
                    Next
                    <ChevronRightIcon className="w-4 h-4 ml-1" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(pagination.totalPages)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors bg-white"
                    title="Last page"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map((client) => (
              <div key={client.id} className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-lg font-medium text-primary-700">
                        {getInitialsFromName(client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim())}
                      </span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {client.name || `${client.firstName || ''} ${client.lastName || ''}`.trim()}
                      </h3>
                      <p className="text-sm text-gray-600"></p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedClients.includes(client.id)}
                    onChange={() => handleSelectClient(client.id)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <EnvelopeIcon className="w-4 h-4 mr-2" />
                    {client.email}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPinIcon className="w-4 h-4 mr-2" />
                    {client.country}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <GlobeAltIcon className="w-4 h-4 mr-2" />
                    <ConferenceNameDisplay conference={client.conference} maxLength={25} />
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    <div>
                      <div>Added: {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}</div>
                      <div className="text-xs text-gray-500">
                        {client.createdAt ? new Date(client.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                    {getStatusDisplayLabel(client.status)}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleView(client)}
                      className="text-blue-600 hover:text-blue-900"
                      title="View"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(client)}
                      className="text-indigo-600 hover:text-indigo-900"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
            </div>
            ))}
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {(showAddForm || showEditForm) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {showEditForm ? 'Edit Client' : 'Add New Client'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setShowEditForm(false);
                      resetForm();
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
    </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Information Section */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <UserPlusIcon className="w-5 h-5 mr-2 text-primary-600" />
          Basic Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              placeholder="Enter full name"
            />
          </div>
        </div>
      </div>

      {/* Contact Information Section */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <EnvelopeIcon className="w-5 h-5 mr-2 text-primary-600" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              placeholder="email@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country
            </label>
            <div className="relative">
              <input
                type="text"
                name="country"
                value={formData.country}
                onFocus={() => setCountryDropdownOpen(true)}
                onChange={(e) => {
                  setCountryQuery(e.target.value);
                  setFormData(prev => ({ ...prev, country: e.target.value }));
                  setCountryDropdownOpen(true);
                }}
                placeholder="Select Country"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
                autoComplete="off"
              />
              {countryDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow">
                  {filteredCountries.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                  ) : (
                    filteredCountries.map((c) => (
                      <div
                        key={c}
                        onMouseDown={() => {
                          setFormData(prev => ({ ...prev, country: c }));
                          setCountryQuery('');
                          setCountryDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
                      >
                        {c}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          
          
        </div>
      </div>

      {/* Conference & Status Section */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CalendarIcon className="w-5 h-5 mr-2 text-primary-600" />
          Conference, Status & Stage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conference
            </label>
            <select
              name="conferenceId"
              value={formData.conferenceId}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            >
              <option value="">No Conference Selected</option>
              {conferences?.map(conference => (
                <option key={conference.id} value={conference.id}>{conference.name}</option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">Which conference</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Status *
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            >
              <option value="Lead">Lead - New contact</option>
              <option value="Abstract Submitted">Abstract Submitted - Paper submitted</option>
              <option value="Registered">Registered - Confirmed attendance</option>
              <option value="Unresponsive">Declined - No response to Stage 1</option>
              <option value="Registration Unresponsive">Registration Unresponsive - No response to Stage 2</option>
              <option value="Rejected">Rejected - Declined</option>
              <option value="Completed">Completed - Conference done</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">Where is this client in their journey?</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Starting Stage *
            </label>
            <select
              name="currentStage"
              value={formData.currentStage}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            >
              <option value="stage1">Stage 1 - Initial email + Abstract submission emails</option>
              <option value="stage2">Stage 2 - Registration emails</option>
              <option value="completed">Completed - No emails</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">Which emails should we send?</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stage 1 follow-ups already sent
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={formData.manualStage1Count}
              onChange={handleManualCountChange('manualStage1Count')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            />
            <p className="mt-1 text-sm text-gray-500">
              Automation starts at attempt {formData.manualStage1Count + 1}. Leave 0 if none were sent yet.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stage 2 follow-ups already sent
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={formData.manualStage2Count}
              onChange={handleManualCountChange('manualStage2Count')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            />
            <p className="mt-1 text-sm text-gray-500">
              Automation starts at attempt {formData.manualStage2Count + 1} once Stage 2 begins.
            </p>
          </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Thread root Message-ID (optional)
          </label>
          <input
            type="text"
            name="threadRootMessageId"
            value={formData.threadRootMessageId}
            onChange={handleInputChange}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            placeholder="Paste the Message-ID of the first email (we'll normalize to <...>)"
          />
          <p className="mt-1 text-sm text-gray-500">
            Keeps all follow-ups in one thread. If left empty, a new thread will be started.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Initial email subject (optional)
          </label>
          <input
            type="text"
            name="initialEmailSubject"
            value={formData.initialEmailSubject}
            onChange={handleInputChange}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white"
            placeholder='Example: "Invitation to ..."' />
          <p className="mt-1 text-sm text-gray-500">
            Follow-ups will use "Re: &lt;this subject&gt;" for stable Gmail threading.
          </p>
        </div>
        </div>
      </div>
      {/* Notes Section */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <PencilIcon className="w-5 h-5 mr-2 text-primary-600" />
          Additional Notes
        </h3>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          rows={4}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-none"
          placeholder="Add any additional notes about this client..."
        />
        <p className="mt-2 text-sm text-gray-500">
          Optional: Add notes about client preferences, requirements, or conversation history
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Automated Email Workflow - How It Works</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p className="font-semibold mb-2">
                Choose the right combination based on where the client is starting:
              </p>
              <ul className="list-disc ml-5 mt-2 space-y-2">
                <li>
                  <strong>Lead + Stage 1:</strong> New client → Sends the <strong>Initial Email (Stage 1)</strong> immediately from the conference Initial template. After that, the system continues automatically into <strong>Stage 2 (Abstract Submission)</strong> and later <strong>Stage 3 (Registration)</strong> based on your conference settings.
                </li>
                <li>
                  <strong>Abstract Submitted + Stage 2:</strong> Client already submitted an abstract → Skips the Initial email and Abstract stage, and sends only <strong>Stage 3 (Registration)</strong> emails until they register or the follow-up cap is reached.
                </li>
                <li>
                  <strong>Registered + Completed:</strong> Client already registered → No automated emails are sent.
                </li>
                <li className="text-orange-700">
                  <strong>Auto-Declined Marking:</strong> If the Abstract Submission follow-up limit is reached and status is still "Lead" → marked "Declined". If the Registration follow-up limit is reached and status is still "Abstract Submitted" → marked "Registration Unresponsive".
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
                  <div className="flex justify-end space-x-3 pt-6">
        <button
          type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setShowEditForm(false);
                        resetForm();
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="submit"
                      disabled={createClientMutation.isLoading || updateClientMutation.isLoading}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
                      {createClientMutation.isLoading || updateClientMutation.isLoading ? 'Saving...' : 'Save Client'}
        </button>
      </div>
    </form>
              </div>
            </div>
          </div>
        )}

        {/* View Modal */}
        {showViewModal && selectedClient && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Client Details</h2>
                  <button
                    onClick={() => setShowViewModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center">
                    <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-2xl font-medium text-primary-700">
                        {getInitialsFromName(selectedClient.name || `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim())}
                      </span>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {selectedClient.name || `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim()}
                      </h3>
                      <p className="text-gray-600">{selectedClient.organization}</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedClient.status)}`}>
                        {getStatusDisplayLabel(selectedClient.status)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Contact Information</h4>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <EnvelopeIcon className="w-4 h-4 mr-2 text-gray-400" />
                          <span className="text-sm text-gray-600">{selectedClient.email}</span>
                        </div>
                        
                        <div className="flex items-center">
                          <MapPinIcon className="w-4 h-4 mr-2 text-gray-400" />
                          <span className="text-sm text-gray-600">{selectedClient.country}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Professional Information</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium text-gray-500">Conference:</span>
                          <span className="text-sm text-gray-600 ml-2">
                            <ConferenceNameDisplay conference={selectedClient.conference} maxLength={40} />
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">Added:</span>
                          <span className="text-sm text-gray-600 ml-2">
                            {new Date(selectedClient.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedClient.notes && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Notes</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                        {selectedClient.notes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-6">
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      handleEdit(selectedClient);
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Edit Client
                  </button>
                  <button
                    onClick={() => setShowViewModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Status Change Modal */}
        {showBulkStatusModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Change Status</h2>
                  <button
                    onClick={() => setShowBulkStatusModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
                
                <p className="text-gray-600 mb-4">
                  Change status for {selectedClients.length} selected client(s)
                </p>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Status
                  </label>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Status</option>
                    {statusOptions.slice(1).map(status => (
                      <option key={status} value={status}>{getStatusDisplayLabel(status)}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowBulkStatusModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkStatusChange}
                    disabled={bulkStatusMutation.isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {bulkStatusMutation.isLoading ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Conference Assignment Modal */}
        {showBulkConferenceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Assign Conference</h2>
                  <button
                    onClick={() => setShowBulkConferenceModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
                
                <p className="text-gray-600 mb-4">
                  Assign {selectedClients.length} selected client(s) to a conference
                </p>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conference
                  </label>
                  <select
                    value={bulkConferenceId}
                    onChange={(e) => setBulkConferenceId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Conference</option>
                    {conferences?.map(conference => (
                      <option key={conference.id} value={conference.id}>{conference.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowBulkConferenceModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkConferenceAssignment}
                    disabled={bulkConferenceMutation.isLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {bulkConferenceMutation.isLoading ? 'Assigning...' : 'Assign Conference'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Upload Modal */}
        {showBulkUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Bulk Client Upload</h2>
                  <button
                    onClick={() => {
                      setShowBulkUploadModal(false);
                      setSelectedFile(null);
                      setUploadResult(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-2">🎯 Flexible Bulk Upload</h3>
                  <div className="space-y-2 text-sm text-blue-800">
                    <p className="font-medium">✅ Required: Name and Email only</p>
                    <p>📋 Optional: Conference, Status, Stage, Country</p>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="font-medium mb-1">Two ways to use:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Quick Import:</strong> Upload just basic contact info now, assign conferences later</li>
                        <li><strong>Full Setup:</strong> Include conference assignment to automatically start email workflows</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Step 1: Download Template
                    </h3>
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors w-full justify-center"
                    >
                      <DocumentArrowDownIcon className="w-5 h-5" />
                      Download Excel Template
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      Template includes example data, detailed instructions, and dropdown options. Only Name and Email are required!
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Step 2: Upload Completed File
                    </h3>
                    
                    <div className="space-y-4">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-blue-500 transition-colors bg-gray-50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <ArrowUpTrayIcon className="w-10 h-10 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">
                            {selectedFile ? selectedFile.name : 'Click to select Excel file'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">.xlsx or .xls files only</p>
                        </div>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>

                      {selectedFile && (
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          {uploading ? (
                            <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              Uploading...
                            </>
                          ) : (
                            <>
                              <ArrowUpTrayIcon className="w-5 h-5" />
                              Upload Clients
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {uploadResult && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        Upload Results
                      </h3>
                      
                      <div className="space-y-3">
                        {uploadResult.success > 0 && (
                          <div className="flex items-center gap-3 text-green-700 bg-green-50 p-4 rounded-lg">
                            <CheckIcon className="w-6 h-6 flex-shrink-0" />
                            <div>
                              <p className="font-semibold">{uploadResult.success} clients uploaded successfully</p>
                              <p className="text-sm">Automatic email workflows have been started</p>
                            </div>
                          </div>
                        )}

                        {uploadResult.failed > 0 && (
                          <div className="flex items-start gap-3 text-red-700 bg-red-50 p-4 rounded-lg">
                            <XMarkIcon className="w-6 h-6 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-semibold mb-2">{uploadResult.failed} clients failed</p>
                              {uploadResult.errors && uploadResult.errors.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">Errors:</p>
                                  <ul className="list-disc list-inside text-sm space-y-1 max-h-40 overflow-y-auto">
                                    {uploadResult.errors.slice(0, 10).map((error, index) => (
                                      <li key={index}>{error}</li>
                                    ))}
                                    {uploadResult.errors.length > 10 && (
                                      <li className="text-red-600 font-medium">
                                        ...and {uploadResult.errors.length - 10} more errors
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-6">
                    <h4 className="font-semibold text-gray-900 mb-3">📧 Email Workflow Automation</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="font-medium text-gray-900 mb-2">When workflows start:</p>
                        <div className="space-y-1.5 ml-2">
                          <div className="flex items-start gap-2">
                            <span className="font-medium min-w-[180px]">No Conference:</span>
                            <span className="text-gray-600">No automated emails (assign conference later to trigger)</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-medium min-w-[180px]">Lead + Conference:</span>
                            <span className="text-gray-600">Full workflow (invitation + Stage 1 + Stage 2)</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-medium min-w-[180px]">Abstract Submitted:</span>
                            <span className="text-gray-600">Only Stage 2 emails (registration reminders)</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-medium min-w-[180px]">Registered:</span>
                            <span className="text-gray-600">No emails sent</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions

const getStatusColor = (status) => {
  switch (status) {
    case 'Lead':
      return 'bg-blue-100 text-blue-800';
    case 'Abstract Submitted':
      return 'bg-yellow-100 text-yellow-800';
    case 'Registered':
      return 'bg-green-100 text-green-800';
    case 'Unresponsive':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStageColor = (stage) => {
  switch (stage) {
    case 'initial':
    case 'stage1':
      return 'bg-yellow-100 text-yellow-800';
    case 'stage2':
      return 'bg-orange-100 text-orange-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStageName = (stage) => {
  switch (stage) {
    case 'initial':
    case 'stage1':
      return 'Stage 1 - Abstract Submission';
    case 'stage2':
      return 'Stage 2 - Registration';
    case 'completed':
      return 'Completed';
    default:
      return 'Stage 1 - Abstract Submission';
  }
};

export default Clients;