import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { 
  Search, Filter, Download, Save, Bookmark, 
  Users, Calendar, Mail, FileText, CheckSquare,
  Clock, X, ChevronDown, ChevronUp, Settings,
  Star, StarOff, Edit2, Trash2, Play
} from 'lucide-react';
import toast from 'react-hot-toast';

const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntities, setSelectedEntities] = useState(['clients', 'conferences', 'emails']);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [showPresets, setShowPresets] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const searchInputRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch search presets
  const { data: presets = [] } = useQuery(
    ['searchPresets'],
    async () => {
      const response = await axios.get('/api/search/presets?includePublic=true');
      return response.data;
    }
  );

  // Fetch users for filters
  const { data: users = [] } = useQuery(
    ['users'],
    async () => {
      const response = await axios.get('/api/users');
      return response.data;
    }
  );

  // Global search mutation
  const globalSearchMutation = useMutation(
    async (searchData) => {
      const response = await axios.post('/api/search/global', searchData);
      return response.data;
    },
    {
      onSuccess: (data) => {
        setSearchResults(data);
        setIsSearching(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Search failed');
        setIsSearching(false);
      }
    }
  );

  // Advanced search mutation
  const advancedSearchMutation = useMutation(
    async (searchData) => {
      const response = await axios.post('/api/search/advanced', searchData);
      return response.data;
    },
    {
      onSuccess: (data) => {
        setSearchResults(data);
        setIsSearching(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Advanced search failed');
        setIsSearching(false);
      }
    }
  );

  // Create preset mutation
  const createPresetMutation = useMutation(
    async (presetData) => {
      const response = await axios.post('/api/search/presets', presetData);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['searchPresets']);
        setShowSavePreset(false);
        toast.success('Search preset saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save preset');
      }
    }
  );

  // Use preset mutation
  const usePresetMutation = useMutation(
    async (presetId) => {
      const response = await axios.post(`/api/search/presets/${presetId}/use`);
      return response.data;
    },
    {
      onSuccess: (data) => {
        // Apply preset to current search
        setSearchQuery(data.preset.query || '');
        setFilters(data.preset.filters || {});
        setSelectedEntities([data.preset.entityType]);
        
        // Execute search with preset
        executeSearch(data.preset.query, [data.preset.entityType], data.preset.filters);
        
        queryClient.invalidateQueries(['searchPresets']);
        toast.success(`Applied preset: ${data.preset.name}`);
      }
    }
  );

  // Export mutation
  const exportMutation = useMutation(
    async (exportData) => {
      const response = await axios.post('/api/search/export', exportData, {
        responseType: 'blob'
      });
      return response.data;
    },
    {
      onSuccess: (data, variables) => {
        // Create download link
        const blob = new Blob([data], { 
          type: variables.format === 'csv' ? 'text/csv' : 
                variables.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
                'application/json'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `search-results-${variables.entityType}-${Date.now()}.${variables.format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Export completed');
      },
      onError: (error) => {
        toast.error('Export failed');
      }
    }
  );

  const executeSearch = (query, entities, searchFilters = {}) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    globalSearchMutation.mutate({
      query: query.trim(),
      entities,
      filters: searchFilters,
      limit: 50
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    executeSearch(searchQuery, selectedEntities, filters);
  };

  const handleEntityToggle = (entity) => {
    setSelectedEntities(prev => 
      prev.includes(entity) 
        ? prev.filter(e => e !== entity)
        : [...prev, entity]
    );
  };

  const getEntityIcon = (entity) => {
    switch (entity) {
      case 'clients': return <Users className="w-4 h-4" />;
      case 'conferences': return <Calendar className="w-4 h-4" />;
      case 'emails': return <Mail className="w-4 h-4" />;
      case 'users': return <Users className="w-4 h-4" />;
      case 'notes': return <FileText className="w-4 h-4" />;
      case 'tasks': return <CheckSquare className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  const getEntityColor = (entity) => {
    switch (entity) {
      case 'clients': return 'text-blue-600 bg-blue-100';
      case 'conferences': return 'text-green-600 bg-green-100';
      case 'emails': return 'text-purple-600 bg-purple-100';
      case 'users': return 'text-orange-600 bg-orange-100';
      case 'notes': return 'text-yellow-600 bg-yellow-100';
      case 'tasks': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatResultDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  };

  const handleExport = (entityType, format = 'csv') => {
    if (!searchResults || !searchResults[entityType] || searchResults[entityType].length === 0) {
      toast.error('No results to export');
      return;
    }

    exportMutation.mutate({
      query: searchQuery,
      entityType,
      filters,
      format
    });
  };

  const handleSavePreset = (presetData) => {
    createPresetMutation.mutate(presetData);
  };

  const handleUsePreset = (presetId) => {
    usePresetMutation.mutate(presetId);
  };

  // Focus search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Global Search</h1>
        <p className="text-gray-600">Search across clients, conferences, emails, users, notes, and tasks</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Main Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all entities..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* Entity Selection */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700 mr-2">Search in:</span>
            {['clients', 'conferences', 'emails', 'users', 'notes', 'tasks'].map(entity => (
              <button
                key={entity}
                type="button"
                onClick={() => handleEntityToggle(entity)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedEntities.includes(entity)
                    ? `${getEntityColor(entity)} border-2 border-current`
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {getEntityIcon(entity)}
                {entity.charAt(0).toUpperCase() + entity.slice(1)}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  showAdvancedFilters
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                Advanced Filters
                {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Bookmark className="w-4 h-4" />
                Presets
              </button>
            </div>

            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        </form>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <AdvancedFilters 
              filters={filters} 
              setFilters={setFilters}
              users={users}
            />
          </div>
        )}

        {/* Presets */}
        {showPresets && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <SearchPresets 
              presets={presets}
              onUsePreset={handleUsePreset}
              onSavePreset={() => setShowSavePreset(true)}
            />
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Results Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Search Results for "{searchQuery}"
                </h2>
                <p className="text-gray-600">
                  {searchResults.totalResults} total results found
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSavePreset(true)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-blue-600"
                >
                  <Save className="w-4 h-4" />
                  Save Search
                </button>
              </div>
            </div>

            {/* Results Tabs */}
            <div className="mt-4 flex gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'all'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All Results ({searchResults.totalResults})
              </button>
              
              {Object.entries(searchResults).map(([key, results]) => {
                if (key === 'totalResults' || key === 'query' || !Array.isArray(results)) return null;
                if (results.length === 0) return null;
                
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      activeTab === key
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {getEntityIcon(key)}
                    <span className="ml-1">
                      {key.charAt(0).toUpperCase() + key.slice(1)} ({results.length})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Content */}
          <div className="p-6">
            {activeTab === 'all' ? (
              <AllResultsView 
                results={searchResults} 
                onExport={handleExport}
                formatResultDate={formatResultDate}
                getEntityIcon={getEntityIcon}
                getEntityColor={getEntityColor}
              />
            ) : (
              <EntityResultsView 
                entityType={activeTab}
                results={searchResults[activeTab] || []}
                onExport={handleExport}
                formatResultDate={formatResultDate}
                getEntityIcon={getEntityIcon}
                getEntityColor={getEntityColor}
              />
            )}
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSavePreset && (
        <SavePresetModal
          searchQuery={searchQuery}
          selectedEntities={selectedEntities}
          filters={filters}
          onSave={handleSavePreset}
          onClose={() => setShowSavePreset(false)}
        />
      )}
    </div>
  );
};

// Advanced Filters Component
const AdvancedFilters = ({ filters, setFilters, users }) => {
  const updateFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Client Filters */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Client Filters</h4>
        
        <div>
          <label className="block text-sm text-gray-700 mb-1">Status</label>
          <select
            value={filters.clientStatus || ''}
            onChange={(e) => updateFilter('clientStatus', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="Lead">Lead</option>
            <option value="Abstract Submitted">Abstract Submitted</option>
            <option value="Registered">Registered</option>
            <option value="Attended">Attended</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Country</label>
          <input
            type="text"
            value={filters.clientCountry || ''}
            onChange={(e) => updateFilter('clientCountry', e.target.value)}
            placeholder="Enter country"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Owner</label>
          <select
            value={filters.ownerId || ''}
            onChange={(e) => updateFilter('ownerId', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Owners</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conference Filters */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Conference Filters</h4>
        
        <div>
          <label className="block text-sm text-gray-700 mb-1">Status</label>
          <select
            value={filters.conferenceStatus || ''}
            onChange={(e) => updateFilter('conferenceStatus', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="Planning">Planning</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Year</label>
          <input
            type="number"
            value={filters.conferenceYear || ''}
            onChange={(e) => updateFilter('conferenceYear', e.target.value)}
            placeholder="2024"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={filters.location || ''}
            onChange={(e) => updateFilter('location', e.target.value)}
            placeholder="Enter location"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Email Filters */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Email Filters</h4>
        
        <div>
          <label className="block text-sm text-gray-700 mb-1">Folder</label>
          <select
            value={filters.emailFolder || ''}
            onChange={(e) => updateFilter('emailFolder', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Folders</option>
            <option value="inbox">Inbox</option>
            <option value="sent">Sent</option>
            <option value="drafts">Drafts</option>
            <option value="trash">Trash</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">From Date</label>
          <input
            type="date"
            value={filters.emailDateFrom || ''}
            onChange={(e) => updateFilter('emailDateFrom', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">To Date</label>
          <input
            type="date"
            value={filters.emailDateTo || ''}
            onChange={(e) => updateFilter('emailDateTo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
    </div>
  );
};

// Search Presets Component
const SearchPresets = ({ presets, onUsePreset, onSavePreset }) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900">Search Presets</h4>
        <button
          onClick={onSavePreset}
          className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:text-blue-700"
        >
          <Save className="w-4 h-4" />
          Save Current Search
        </button>
      </div>

      {presets.length === 0 ? (
        <p className="text-gray-500 text-sm">No presets saved yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {presets.map(preset => (
            <div
              key={preset.id}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium text-gray-900">{preset.name}</h5>
                  <p className="text-sm text-gray-600">{preset.description}</p>
                  <p className="text-xs text-gray-500">
                    {preset.entityType} • Used {preset.usageCount} times
                  </p>
                </div>
                <button
                  onClick={() => onUsePreset(preset.id)}
                  className="p-1 text-gray-600 hover:text-blue-600"
                  title="Use preset"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// All Results View Component
const AllResultsView = ({ results, onExport, formatResultDate, getEntityIcon, getEntityColor }) => {
  const allResults = Object.entries(results)
    .filter(([key]) => key !== 'totalResults' && key !== 'query')
    .flatMap(([entityType, entityResults]) => 
      entityResults.map(result => ({ ...result, entityType }))
    )
    .sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));

  return (
    <div className="space-y-4">
      {allResults.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>No results found</p>
        </div>
      ) : (
        allResults.map((result, index) => (
          <div
            key={`${result.entityType}-${result.id}`}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEntityColor(result.entityType)}`}>
                    {getEntityIcon(result.entityType)}
                    <span className="ml-1">{result.entityType}</span>
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatResultDate(result.createdAt || result.date)}
                  </span>
                </div>
                
                <h3 className="font-medium text-gray-900 mb-1">
                  {result.title || result.name || result.subject || result.firstName + ' ' + result.lastName}
                </h3>
                
                <p className="text-sm text-gray-600">
                  {result.description || result.body || result.email || result.content}
                </p>
              </div>
              
              <button
                onClick={() => onExport(result.entityType)}
                className="p-2 text-gray-600 hover:text-blue-600"
                title="Export results"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// Entity Results View Component
const EntityResultsView = ({ entityType, results, onExport, formatResultDate, getEntityIcon, getEntityColor }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {getEntityIcon(entityType)}
          <span className="ml-2">{entityType.charAt(0).toUpperCase() + entityType.slice(1)} Results</span>
        </h3>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => onExport(entityType, 'csv')}
            className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-blue-600"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => onExport(entityType, 'xlsx')}
            className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-blue-600"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>No {entityType} results found</p>
        </div>
      ) : (
        results.map((result, index) => (
          <div
            key={result.id}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">
                    {formatResultDate(result.createdAt || result.date)}
                  </span>
                  {result.searchScore && (
                    <span className="text-xs text-gray-400">
                      Score: {result.searchScore}
                    </span>
                  )}
                </div>
                
                <h3 className="font-medium text-gray-900 mb-1">
                  {result.title || result.name || result.subject || result.firstName + ' ' + result.lastName}
                </h3>
                
                <p className="text-sm text-gray-600">
                  {result.description || result.body || result.email || result.content}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// Save Preset Modal Component
const SavePresetModal = ({ searchQuery, selectedEntities, filters, onSave, onClose }) => {
  const [presetData, setPresetData] = useState({
    name: '',
    description: '',
    entityType: selectedEntities.length === 1 ? selectedEntities[0] : 'global',
    isPublic: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!presetData.name.trim()) return;

    onSave({
      ...presetData,
      query: searchQuery,
      filters,
      selectedEntities
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Save Search Preset</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preset Name *
            </label>
            <input
              type="text"
              value={presetData.name}
              onChange={(e) => setPresetData({ ...presetData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={presetData.description}
              onChange={(e) => setPresetData({ ...presetData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              value={presetData.entityType}
              onChange={(e) => setPresetData({ ...presetData, entityType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="global">Global Search</option>
              <option value="clients">Clients</option>
              <option value="conferences">Conferences</option>
              <option value="emails">Emails</option>
              <option value="users">Users</option>
              <option value="notes">Notes</option>
              <option value="tasks">Tasks</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={presetData.isPublic}
              onChange={(e) => setPresetData({ ...presetData, isPublic: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700">
              Make this preset public (visible to all team members)
            </label>
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save Preset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GlobalSearch;
