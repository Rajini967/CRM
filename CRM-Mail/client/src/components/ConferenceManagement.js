import React, { useMemo, useState } from 'react';
import { 
  PlusIcon, 
  CalendarIcon, 
  MapPinIcon, 
  GlobeAltIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const EMAIL_INPUT_SPLIT_REGEX = /[,\n\r;]+/;
const EMAIL_VALIDATE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const formatEmailListForInput = (list) => {
  if (!Array.isArray(list) || list.length === 0) {
    return '';
  }
  return list.join(', ');
};

const parseFollowupCcInput = (input) => {
  if (!input || typeof input !== 'string') {
    return { emails: [], invalid: [] };
  }

  const seen = new Set();
  const emails = [];
  const invalid = [];

  input.split(EMAIL_INPUT_SPLIT_REGEX).forEach((part) => {
    const email = part.trim();
    if (!email) {
      return;
    }
    if (!EMAIL_VALIDATE_REGEX.test(email)) {
      invalid.push(email);
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    emails.push(email);
  });

  return { emails, invalid };
};

const sanitizeTemplateSequence = (sequence, limit) => {
  if (!Array.isArray(sequence)) {
    return [];
  }
  const cleaned = sequence
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean);
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    return cleaned.slice(0, limit);
  }
  return cleaned;
};

const isValidHttpUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const ConferenceManagement = () => {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingConference, setEditingConference] = useState(null);
  const [deletingConference, setDeletingConference] = useState(null);
  const [viewingConference, setViewingConference] = useState(null);
  const [templateConference, setTemplateConference] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [activeTemplateStage, setActiveTemplateStage] = useState('stage1');
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    venue: '',
    startDate: '',
    endDate: '',
    description: '',
    website: '',
    abstractSubmissionLink: '',
    registrationLink: '',
    currency: 'USD',
    abstractDeadline: '',
    registrationDeadline: '',
    stage1TemplateId: '',
    stage2TemplateId: '',
    stage1Templates: [],
    stage2Templates: [],
    // Conference Settings
    stage1IntervalValue: 7,
    stage1IntervalUnit: 'days',
    stage1MaxFollowUps: 6,
    stage2IntervalValue: 3,
    stage2IntervalUnit: 'days',
    stage2MaxFollowUps: 6,
    skipWeekends: true,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    timezone: 'UTC',
    followupCcInput: '',
    // Team Assignment
    assignedTeamLeadId: '',
    assignedMemberIds: [],
    // Available team members for selection
    availableTeamLeads: [],
    availableMembers: [],
    stage1Template: {
      subject: '',
      bodyHtml: '',
      bodyText: ''
    },
    stage2Template: {
      subject: '',
      bodyHtml: '',
      bodyText: ''
    },
    // SMTP mapping for this conference (EmailAccount ID)
    smtp_default_id: ''
  });
  const [templateData, setTemplateData] = useState({
    stage1: {
      subject: '',
      bodyHtml: '',
      bodyText: ''
    },
    stage2: {
      subject: '',
      bodyHtml: '',
      bodyText: ''
    }
  });
  const queryClient = useQueryClient();

  // Fetch conferences with React Query
  const { data: conferences = [], isLoading, error, refetch } = useQuery('conferences', async () => {
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
    // For Members, enable focus refetch for immediate updates when switching back to browser
    refetchOnWindowFocus: user?.role === 'Member',
  });

  // Fetch templates with React Query
  const { data: templates = [], isLoading: templatesLoading } = useQuery('templates', async () => {
    try {
    const response = await axios.get('/api/templates');
    return response.data;
    } catch (error) {
      console.error('Error fetching templates:', error);
      return []; // Return empty array on error
    }
  }, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch SMTP accounts so CEO can map one per conference
  const { data: smtpAccounts = [] } = useQuery('smtp-accounts', async () => {
    try {
      const response = await axios.get('/api/smtp-accounts');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching SMTP accounts:', error);
      return [];
    }
  }, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const templatesById = useMemo(() => {
    const lookup = {};
    (templates || []).forEach((template) => {
      if (template?.id) {
        lookup[template.id] = template;
      }
    });
    return lookup;
  }, [templates]);

  const stageTemplateOptions = useMemo(() => {
    const stage1 = (templates || []).filter((template) => template.stage === 'abstract_submission');
    const stage2 = (templates || []).filter((template) => template.stage === 'registration');
    return { stage1, stage2 };
  }, [templates]);

  // Fetch users for team assignment
  const { data: users = [] } = useQuery('users', async () => {
    try {
    const response = await axios.get('/api/users', {
      params: {
        role: 'all',
        isActive: true,
        limit: 500
      }
    });
    return response.data.users || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      return []; // Return empty array on error
    }
  }, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Create conference mutation
  const createMutation = useMutation(async (conferenceData) => {
    const response = await axios.post('/api/conferences', conferenceData);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('conferences');
      toast.success('Conference created successfully');
      handleCloseModal();
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to create conference';
      toast.error(errorMessage);
    }
  });

  // Update conference mutation
  const updateMutation = useMutation(async ({ id, data }) => {
    const response = await axios.put(`/api/conferences/${id}`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('conferences');
      toast.success('Conference updated successfully');
      handleCloseModal();
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to update conference';
      toast.error(errorMessage);
    }
  });

  // Delete conference mutation
  const deleteMutation = useMutation(async (id) => {
    const response = await axios.delete(`/api/conferences/${id}`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('conferences');
      toast.success('Conference deleted successfully');
      setShowDeleteModal(false);
      setDeletingConference(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete conference');
    }
  });

  // Update templates mutation
  const updateTemplatesMutation = useMutation(async ({ id, templates }) => {
    const response = await axios.put(`/api/conferences/${id}/templates`, templates);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('conferences');
      toast.success('Email templates updated successfully');
      setShowTemplateModal(false);
      setTemplateConference(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update templates');
    }
  });

  // Filter and search logic
  const filteredConferences = React.useMemo(() => {
    // Ensure conferences is an array and handle undefined/null cases
    if (!conferences || !Array.isArray(conferences)) {
      console.warn('Conferences data is not an array:', conferences);
      return [];
    }
    
    let filtered = conferences.filter(conference => {
      // Ensure conference is an object
      if (!conference || typeof conference !== 'object') {
        console.warn('Invalid conference object:', conference);
        return false;
      }
      return true;
    });

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(conference => {
        try {
          const name = (conference.name || '').toString().toLowerCase();
          const venue = (conference.venue || '').toString().toLowerCase();
          const description = (conference.description || '').toString().toLowerCase();
          const shortName = (conference.shortName || '').toString().toLowerCase();
          const searchLower = searchTerm.toLowerCase();
          
          return name.includes(searchLower) ||
                 venue.includes(searchLower) ||
                 description.includes(searchLower) ||
                 shortName.includes(searchLower);
        } catch (error) {
          console.warn('Error in search filter:', error, conference);
          return false;
        }
      });
    }

    // Status filter
    if (filterStatus !== 'all') {
      const now = new Date();
      filtered = filtered.filter(conference => {
        try {
          if (!conference.startDate || !conference.endDate) return false;
          
          const startDate = new Date(conference.startDate);
          const endDate = new Date(conference.endDate);
          
          // Check if dates are valid
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
          
          switch (filterStatus) {
            case 'upcoming':
              return startDate > now;
            case 'ongoing':
              return startDate <= now && endDate >= now;
            case 'completed':
              return endDate < now;
            default:
              return true;
          }
        } catch (error) {
          console.warn('Error in status filter:', error, conference);
          return false;
        }
      });
    }

    // Sort
    try {
      filtered.sort((a, b) => {
        let aValue = a[sortBy] || '';
        let bValue = b[sortBy] || '';
        
        if (sortBy === 'startDate' || sortBy === 'endDate') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
          
          // Handle invalid dates
          if (isNaN(aValue.getTime())) aValue = new Date(0);
          if (isNaN(bValue.getTime())) bValue = new Date(0);
        }
        
        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    } catch (error) {
      console.warn('Error in sorting:', error);
    }

    return filtered;
  }, [conferences, searchTerm, filterStatus, sortBy, sortOrder]);

  // Handler functions
  const handleCloseModal = () => {
    setShowModal(false);
    setEditingConference(null);
    setFormData({
      name: '',
      shortName: '',
      venue: '',
      startDate: '',
      endDate: '',
      description: '',
      website: '',
      abstractSubmissionLink: '',
      registrationLink: '',
      currency: 'USD',
      abstractDeadline: '',
      registrationDeadline: '',
      stage1TemplateId: '',
      stage2TemplateId: '',
      stage1Templates: [],
      stage2Templates: [],
      // Conference Settings
      stage1IntervalValue: 7,
      stage1IntervalUnit: 'days',
      stage1MaxFollowUps: 6,
      stage2IntervalValue: 3,
      stage2IntervalUnit: 'days',
      stage2MaxFollowUps: 6,
      skipWeekends: true,
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      timezone: 'UTC',
      followupCcInput: '',
      // Team Assignment
      assignedTeamLeadId: '',
      assignedMemberIds: [],
      // Available team members for selection
      availableTeamLeads: [],
      availableMembers: [],
      stage1Template: {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      },
      stage2Template: {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      },
      smtp_default_id: ''
    });
  };

  const handleCreate = () => {
    setEditingConference(null);
    setShowModal(true);
  };

  const handleEdit = (conference) => {
    setEditingConference(conference);
    
    // Parse interval settings from conference.settings or fallback to old format
    const settings = conference.settings || {};
    const followupIntervals = settings.followup_intervals || {};
    const maxAttempts = settings.max_attempts || {};
    const followupCcInput = formatEmailListForInput(Array.isArray(settings.followupCC) ? settings.followupCC : []);
    
    // Stage 1 interval
    let stage1Value = 7, stage1Unit = 'days';
    if (followupIntervals.Stage1) {
      if (typeof followupIntervals.Stage1 === 'object') {
        stage1Value = followupIntervals.Stage1.value || 7;
        stage1Unit = followupIntervals.Stage1.unit || 'days';
      } else {
        stage1Value = followupIntervals.Stage1; // old format (number)
      }
    }
    
    // Stage 2 interval
    let stage2Value = 3, stage2Unit = 'days';
    if (followupIntervals.Stage2) {
      if (typeof followupIntervals.Stage2 === 'object') {
        stage2Value = followupIntervals.Stage2.value || 3;
        stage2Unit = followupIntervals.Stage2.unit || 'days';
      } else {
        stage2Value = followupIntervals.Stage2; // old format (number)
      }
    }
    
    const abstractLinkFromSettings = typeof settings.abstractSubmissionLink === 'string' ? settings.abstractSubmissionLink : '';
    const registrationLinkFromSettings = typeof settings.registrationLink === 'string' ? settings.registrationLink : '';
    const fallbackWebsiteLink = conference.website || '';
    const abstractSubmissionLink = abstractLinkFromSettings || fallbackWebsiteLink;
    const registrationLink = registrationLinkFromSettings || fallbackWebsiteLink;
    const stage1Templates = Array.isArray(settings.stage1Templates)
      ? settings.stage1Templates.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];
    const stage2Templates = Array.isArray(settings.stage2Templates)
      ? settings.stage2Templates.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];
    if (!stage1Templates.length && conference.stage1TemplateId) {
      stage1Templates.push(conference.stage1TemplateId);
    }
    if (!stage2Templates.length && conference.stage2TemplateId) {
      stage2Templates.push(conference.stage2TemplateId);
    }
    const sanitizedAssignedMembers = Array.isArray(conference.assignedMemberIds)
      ? conference.assignedMemberIds.filter(Boolean)
      : [];
    const smtpDefaultId = typeof settings.smtp_default_id === 'string' ? settings.smtp_default_id : '';

    setFormData({
      name: conference.name,
      shortName: conference.shortName || '',
      venue: conference.venue,
      startDate: conference.startDate ? conference.startDate.split('T')[0] : '',
      endDate: conference.endDate ? conference.endDate.split('T')[0] : '',
      description: conference.description || '',
      website: conference.website || '',
      abstractSubmissionLink,
      registrationLink,
      currency: conference.currency || 'USD',
      abstractDeadline: conference.abstractDeadline ? conference.abstractDeadline.split('T')[0] : '',
      registrationDeadline: conference.registrationDeadline ? conference.registrationDeadline.split('T')[0] : '',
      stage1TemplateId: stage1Templates[0] || conference.stage1TemplateId || '',
      stage2TemplateId: stage2Templates[0] || conference.stage2TemplateId || '',
      stage1Templates,
      stage2Templates,
      // Conference Settings
      stage1IntervalValue: stage1Value,
      stage1IntervalUnit: stage1Unit,
      // Interpret stored Stage1 max_attempts as "initial + follow-ups".
      // The UI field (stage1MaxFollowUps) should show only the number of
      // follow-ups AFTER the initial email.
      stage1MaxFollowUps: maxAttempts.Stage1 ? Math.max(1, maxAttempts.Stage1 - 1) : 6,
      stage2IntervalValue: stage2Value,
      stage2IntervalUnit: stage2Unit,
      stage2MaxFollowUps: maxAttempts.Stage2 || 6,
      skipWeekends: settings.skip_weekends !== undefined ? settings.skip_weekends : true,
      workingHoursStart: settings.working_hours?.start || '09:00',
      workingHoursEnd: settings.working_hours?.end || '17:00',
      timezone: settings.timezone || 'UTC',
      followupCcInput,
      assignedTeamLeadId: conference.assignedTeamLeadId || '',
      assignedMemberIds: sanitizedAssignedMembers,
      stage1Template: conference.stage1Template || {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      },
      stage2Template: conference.stage2Template || {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      },
      smtp_default_id: smtpDefaultId
    });
    setShowModal(true);
  };

  const handleView = (conference) => {
    setViewingConference(conference);
    setShowViewModal(true);
  };

  const handleDelete = (conference) => {
    setDeletingConference(conference);
    setShowDeleteModal(true);
  };

  const handleTemplates = (conference) => {
    setTemplateConference(conference);
    setTemplateData({
      stage1: conference.stage1Template || {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      },
      stage2: conference.stage2Template || {
        subject: '',
        bodyHtml: '',
        bodyText: ''
      }
    });
    setShowTemplateModal(true);
  };

  const getTemplateSlots = (stage) => {
    const rawMax = stage === 'stage1'
      ? Number(formData.stage1MaxFollowUps) || 0
      : Number(formData.stage2MaxFollowUps) || 0;
    // Display only the number of templates equal to maxFollowups
    // (The initial email is handled separately and sent manually)
    const max = rawMax;
    const templatesKey = stage === 'stage1' ? 'stage1Templates' : 'stage2Templates';
    const source = Array.isArray(formData[templatesKey]) ? formData[templatesKey] : [];
    return Array.from({ length: max }, (_, index) => source[index] || '');
  };

  const handleMaxFollowUpsInputChange = (stage, rawValue) => {
    const parsedNumber = Number(rawValue);
    const parsed = Number.isFinite(parsedNumber) && parsedNumber > 0
      ? Math.min(20, Math.floor(parsedNumber))
      : 1;

    setFormData((prev) => {
      const maxKey = stage === 'stage1' ? 'stage1MaxFollowUps' : 'stage2MaxFollowUps';
      const templatesKey = stage === 'stage1' ? 'stage1Templates' : 'stage2Templates';
      const templateIdKey = stage === 'stage1' ? 'stage1TemplateId' : 'stage2TemplateId';
      const currentTemplates = Array.isArray(prev[templatesKey]) ? [...prev[templatesKey]] : [];
      let nextTemplates = currentTemplates;

      // Use the same max for both stages (the +1 for initial email is handled at submit time for backend compatibility)
      const effectiveMax = parsed;

      if (effectiveMax < currentTemplates.length) {
        const trimmed = currentTemplates.slice(effectiveMax);
        const hasAssignments = trimmed.some((id) => id && id.trim());
        if (hasAssignments && typeof window !== 'undefined') {
          const confirmed = window.confirm(
            'Reducing the max follow-ups will remove template assignments beyond the new limit. Continue?'
          );
          if (!confirmed) {
            return prev;
          }
        }
        nextTemplates = currentTemplates.slice(0, effectiveMax);
      } else if (effectiveMax > currentTemplates.length) {
        nextTemplates = [
          ...currentTemplates,
          ...Array(effectiveMax - currentTemplates.length).fill('')
        ];
      }

      const firstNonEmpty = nextTemplates.find((id) => id && id.trim()) || '';

      return {
        ...prev,
        [maxKey]: parsed,
        [templatesKey]: nextTemplates,
        [templateIdKey]: firstNonEmpty
      };
    });
  };

  const handleTemplateSlotChange = (stage, index, templateId) => {
    setFormData((prev) => {
      const templatesKey = stage === 'stage1' ? 'stage1Templates' : 'stage2Templates';
      const templateIdKey = stage === 'stage1' ? 'stage1TemplateId' : 'stage2TemplateId';
      const previewKey = stage === 'stage1' ? 'stage1Template' : 'stage2Template';
      const currentTemplates = Array.isArray(prev[templatesKey]) ? [...prev[templatesKey]] : [];
      while (currentTemplates.length <= index) {
        currentTemplates.push('');
      }
      currentTemplates[index] = templateId || '';
      const firstNonEmpty = currentTemplates.find((id) => id && id.trim()) || '';
      const selectedTemplate = templateId ? templatesById[templateId] : null;

      return {
        ...prev,
        [templatesKey]: currentTemplates,
        [templateIdKey]: firstNonEmpty,
        [previewKey]: selectedTemplate ? {
          subject: selectedTemplate.subject,
          bodyHtml: selectedTemplate.bodyHtml,
          bodyText: selectedTemplate.bodyText
        } : {
          subject: '',
          bodyHtml: '',
          bodyText: ''
        }
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name || !formData.name.trim()) {
      toast.error('Conference name is required');
      return;
    }
    
    if (!formData.shortName || !formData.shortName.trim()) {
      toast.error('Conference short name is required');
      return;
    }
    
    if (!formData.venue || !formData.venue.trim()) {
      toast.error('Venue is required');
      return;
    }
    
    if (!formData.startDate) {
      toast.error('Start date is required');
      return;
    }
    
    if (!formData.endDate) {
      toast.error('End date is required');
      return;
    }
    
    // Transform interval data to new format
    const trimmedShortName = (formData.shortName || '').trim().slice(0, 50);

    const parsePositiveNumber = (value, fallback, label) => {
      const raw = value !== undefined && value !== null ? String(value).trim() : '';
      if (raw === '') {
        return fallback;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error(`${label} must be a positive number`);
        return null;
      }
      return parsed;
    };

    const normalizeUnit = (unit) => {
      const allowed = ['minutes', 'hours', 'days'];
      if (typeof unit === 'string' && allowed.includes(unit)) {
        return unit;
      }
      return 'days';
    };

    const stage1IntervalValue = parsePositiveNumber(formData.stage1IntervalValue, 7, 'Stage 1 interval');
    if (stage1IntervalValue === null) return;
    const stage2IntervalValue = parsePositiveNumber(formData.stage2IntervalValue, 3, 'Stage 2 interval');
    if (stage2IntervalValue === null) return;
    const stage1MaxFollowUps = parsePositiveNumber(formData.stage1MaxFollowUps, 6, 'Stage 1 max follow-ups');
    if (stage1MaxFollowUps === null) return;
    const stage2MaxFollowUps = parsePositiveNumber(formData.stage2MaxFollowUps, 6, 'Stage 2 max follow-ups');
    if (stage2MaxFollowUps === null) return;

    const stage1Unit = normalizeUnit(formData.stage1IntervalUnit);
    const stage2Unit = normalizeUnit(formData.stage2IntervalUnit);
    const ensureValidOptionalUrl = (value, label) => {
      const trimmed = (value || '').trim();
      if (!trimmed) {
        return '';
      }
      if (!isValidHttpUrl(trimmed)) {
        toast.error(`${label} must be a valid URL starting with http:// or https://`);
        throw new Error('invalid-url');
      }
      return trimmed;
    };

    let abstractLink = '';
    let registrationLink = '';

    try {
      abstractLink = ensureValidOptionalUrl(formData.abstractSubmissionLink, 'Abstract Submission Link');
      registrationLink = ensureValidOptionalUrl(formData.registrationLink, 'Registration Link');
    } catch (validationError) {
      return;
    }
    const { emails: followupCcList, invalid: invalidCc } = parseFollowupCcInput(formData.followupCcInput);
    if (invalidCc.length > 0) {
      toast.error(`Invalid CC email${invalidCc.length > 1 ? 's' : ''}: ${invalidCc.join(', ')}`);
      return;
    }

    // For Stage 1, reserve one extra slot for the Initial Email (index 0),
    // and interpret "Max Follow-ups" in the UI as the number of Abstract
    // Submission follow-ups AFTER the initial email.
    const stage1Sequence = sanitizeTemplateSequence(
      formData.stage1Templates || [],
      stage1MaxFollowUps + 1
    );
    const stage2Sequence = sanitizeTemplateSequence(formData.stage2Templates || [], stage2MaxFollowUps);

    const submitData = {
      ...formData,
      shortName: trimmedShortName,
      stage1IntervalValue,
      stage1IntervalUnit: stage1Unit,
      stage1MaxFollowUps,
      stage2IntervalValue,
      stage2IntervalUnit: stage2Unit,
      stage2MaxFollowUps,
      settings: {
        followup_intervals: {
          Stage1: { value: stage1IntervalValue, unit: stage1Unit },
          Stage2: { value: stage2IntervalValue, unit: stage2Unit }
        },
        max_attempts: {
          // Store Stage 1 max attempts as "initial + follow-ups" so the scheduler
          // can send the initial email plus the configured number of follow-ups.
          Stage1: Math.floor(stage1MaxFollowUps + 1),
          Stage2: Math.floor(stage2MaxFollowUps)
        },
        skip_weekends: formData.skipWeekends,
        timezone: formData.timezone,
        working_hours: {
          start: formData.workingHoursStart,
          end: formData.workingHoursEnd
        },
        abstractSubmissionLink: abstractLink || null,
        registrationLink: registrationLink || null,
        followupCC: followupCcList,
        stage1Templates: stage1Sequence,
        stage2Templates: stage2Sequence,
        smtp_default_id: formData.smtp_default_id || null
      }
    };
    submitData.website = formData.website || registrationLink || abstractLink || '';
    delete submitData.abstractSubmissionLink;
    delete submitData.registrationLink;
    delete submitData.stage1Templates;
    delete submitData.stage2Templates;
    submitData.stage1TemplateId = stage1Sequence[0] || submitData.stage1TemplateId || '';
    submitData.stage2TemplateId = stage2Sequence[0] || submitData.stage2TemplateId || '';
    
    if (editingConference) {
      updateMutation.mutate({ id: editingConference.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleTemplateSubmit = (e) => {
    e.preventDefault();
    if (templateConference) {
      updateTemplatesMutation.mutate({ 
        id: templateConference.id, 
        templates: templateData 
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (deletingConference) {
      deleteMutation.mutate(deletingConference.id);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTemplateChange = (e) => {
    const { name, value } = e.target;
    setTemplateData(prev => ({
      ...prev,
      [activeTemplateStage]: {
        ...prev[activeTemplateStage],
        [name]: value
      }
    }));
  };

  const handleCloseTemplateModal = () => {
    setShowTemplateModal(false);
    setTemplateConference(null);
    setTemplateData({
      stage1: { subject: '', bodyHtml: '', bodyText: '' },
      stage2: { subject: '', bodyHtml: '', bodyText: '' }
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (conference) => {
    const now = new Date();
    const startDate = new Date(conference.startDate);
    const endDate = new Date(conference.endDate);
    
    if (startDate > now) {
      return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">Upcoming</span>;
    } else if (startDate <= now && endDate >= now) {
      return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Ongoing</span>;
    } else {
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Completed</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 text-center">
          <p className="text-lg font-semibold">Error loading conferences</p>
          <p className="text-sm">{error.message}</p>
          <button 
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conferences</h1>
            <p className="text-gray-600">Manage your conference events and settings</p>
          </div>
          {user?.role === 'CEO' && (
            <button
              onClick={handleCreate}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              Add Conference
            </button>
          )}
        </div>

        {/* Search and Filter Controls */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conferences..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name">Sort by Name</option>
            <option value="startDate">Sort by Start Date</option>
            <option value="endDate">Sort by End Date</option>
            <option value="venue">Sort by Venue</option>
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {/* Conferences Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredConferences.map((conference) => (
          <div key={conference.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {conference.name}
                  {conference.shortName ? (
                    <span className="text-sm text-gray-500 ml-2">({conference.shortName})</span>
                  ) : null}
                </h3>
                {getStatusBadge(conference)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleView(conference)}
                  className="p-1 text-gray-400 hover:text-blue-600"
                  title="View"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                {user?.role !== 'Member' && (
                  <button
                    onClick={() => handleEdit(conference)}
                    className="p-1 text-gray-400 hover:text-yellow-600"
                    title="Edit"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(conference)}
                  className="p-1 text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPinIcon className="h-4 w-4" />
                <span className="text-sm">{conference.venue}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <CalendarIcon className="h-4 w-4" />
                <span className="text-sm">
                  {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
                </span>
              </div>
              
              {conference.website && (
                <div className="flex items-center gap-2 text-gray-600">
                  <GlobeAltIcon className="h-4 w-4" />
                  <a 
                    href={conference.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {conference.website}
                  </a>
                </div>
              )}
              
              {conference.description && (
                <p className="text-sm text-gray-600 line-clamp-2">{conference.description}</p>
              )}
              
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                  <p>Abstract Deadline: {formatDate(conference.abstractDeadline)}</p>
                  <p>Registration Deadline: {formatDate(conference.registrationDeadline)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredConferences.length === 0 && (
        <div className="text-center py-12">
          <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No conferences found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || filterStatus !== 'all' 
              ? 'Try adjusting your search or filter criteria.'
              : conferences.length === 0
                ? "You haven't been assigned to any conferences yet. Contact your Team Lead to get access to conference data."
              : 'Get started by creating a new conference.'
            }
          </p>
          {!searchTerm && filterStatus === 'all' && conferences.length > 0 && user?.role === 'CEO' && (
            <div className="mt-6">
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
              >
                <PlusIcon className="h-5 w-5" />
                Add Conference
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-auto max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {editingConference ? 'Edit Conference' : 'Create Conference'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {editingConference ? 'Update conference details and email templates' : 'Set up a new conference with email automation'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Fields marked with <span className="text-red-500">*</span> are required
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="p-6">

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Conference Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      placeholder="Enter conference name"
                    />
                    <div className="mt-4 space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        Conference Short Name <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500">
                        Abbreviation displayed alongside the full name (e.g., CRM2025)
                      </p>
                      <input
                        type="text"
                        name="shortName"
                        value={formData.shortName}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., CRM2025"
                        maxLength={50}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Venue <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="venue"
                      value={formData.venue}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      placeholder="Enter venue name"
                    />
                  </div>
                </div>
              </div>

              {/* Conference Dates */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Conference Dates</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Additional Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Abstract Submission Link
                    </label>
                    <input
                      type="url"
                      name="abstractSubmissionLink"
                      value={formData.abstractSubmissionLink}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      placeholder="https://abstracts.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Link
                    </label>
                    <input
                      type="url"
                      name="registrationLink"
                      value={formData.registrationLink}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      placeholder="https://register.example.com"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Currency
                    </label>
                    <select
                      name="currency"
                      value={formData.currency}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="INR">INR - Indian Rupee</option>
                    </select>
                  </div>

                  {/* SMTP Mapping - CEO only */}
                  {user?.role === 'CEO' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMTP Account for this Conference
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Choose which SMTP account should send all automated emails for this conference.
                        If left blank, the system primary SMTP will be used.
                      </p>
                      <select
                        name="smtp_default_id"
                        value={formData.smtp_default_id}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      >
                        <option value="">Use system primary SMTP</option>
                        {smtpAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name || account.email} ({account.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Important Deadlines */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Important Deadlines</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Abstract Deadline
                    </label>
                    <input
                      type="date"
                      name="abstractDeadline"
                      value={formData.abstractDeadline}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Deadline
                    </label>
                    <input
                      type="date"
                      name="registrationDeadline"
                      value={formData.registrationDeadline}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Conference Settings */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-6 border border-orange-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">Follow-up Settings</h4>
                    <p className="text-sm text-gray-600">Configure automated follow-up intervals and limits</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Stage 1 Settings */}
                  <div className="bg-white rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center mb-4">
                      <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-blue-600 font-semibold text-sm">1</span>
                      </div>
                      <h5 className="text-sm font-semibold text-gray-900">Abstract Submission Stage</h5>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Follow-up Interval
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            name="stage1IntervalValue"
                            value={formData.stage1IntervalValue}
                            onChange={handleInputChange}
                            min="1"
                            max="999"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                            placeholder="7"
                          />
                          <select
                            name="stage1IntervalUnit"
                            value={formData.stage1IntervalUnit}
                            onChange={handleInputChange}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Time between follow-up emails</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Follow-ups
                        </label>
                        <input
                          type="number"
                          name="stage1MaxFollowUps"
                          value={formData.stage1MaxFollowUps}
                          onChange={handleInputChange}
                          min="1"
                          max="20"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                          placeholder="6"
                        />
                        <p className="text-xs text-gray-500 mt-1">Maximum number of follow-up emails</p>
                      </div>
                    </div>
                  </div>

                  {/* Stage 2 Settings */}
                  <div className="bg-white rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center mb-4">
                      <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-green-600 font-semibold text-sm">2</span>
                      </div>
                      <h5 className="text-sm font-semibold text-gray-900">Registration Stage</h5>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Follow-up Interval
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            name="stage2IntervalValue"
                            value={formData.stage2IntervalValue}
                            onChange={handleInputChange}
                            min="1"
                            max="999"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white"
                            placeholder="3"
                          />
                          <select
                            name="stage2IntervalUnit"
                            value={formData.stage2IntervalUnit}
                            onChange={handleInputChange}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Time between follow-up emails</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Follow-ups
                        </label>
                        <input
                          type="number"
                          name="stage2MaxFollowUps"
                          value={formData.stage2MaxFollowUps}
                          onChange={handleInputChange}
                          min="1"
                          max="20"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white"
                          placeholder="6"
                        />
                        <p className="text-xs text-gray-500 mt-1">Maximum number of follow-up emails</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Global Settings */}
                <div className="mt-6 bg-white rounded-lg p-4 border border-orange-200">
                  <h5 className="text-sm font-semibold text-gray-900 mb-4">Global Settings</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          name="skipWeekends"
                          checked={formData.skipWeekends}
                          onChange={(e) => setFormData(prev => ({ ...prev, skipWeekends: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Skip Weekends</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">Don't send emails on Saturday & Sunday</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Working Hours Start
                      </label>
                      <input
                        type="time"
                        name="workingHoursStart"
                        value={formData.workingHoursStart}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Working Hours End
                      </label>
                      <input
                        type="time"
                        name="workingHoursEnd"
                        value={formData.workingHoursEnd}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Timezone
                    </label>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white"
                    >
                      <option value="UTC">UTC - Coordinated Universal Time</option>
                      <option value="America/New_York">EST - Eastern Time</option>
                      <option value="America/Chicago">CST - Central Time</option>
                      <option value="America/Denver">MST - Mountain Time</option>
                      <option value="America/Los_Angeles">PST - Pacific Time</option>
                      <option value="Europe/London">GMT - Greenwich Mean Time</option>
                      <option value="Europe/Paris">CET - Central European Time</option>
                      <option value="Asia/Tokyo">JST - Japan Standard Time</option>
                      <option value="Asia/Shanghai">CST - China Standard Time</option>
                      <option value="Asia/Kolkata">IST - India Standard Time</option>
                      <option value="Australia/Sydney">AEST - Australian Eastern Time</option>
                    </select>
                  </div>
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CC emails for follow-ups (optional)
                </label>
                <textarea
                  name="followupCcInput"
                  value={formData.followupCcInput}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white resize-none"
                  placeholder="e.g. ops@example.com, finance@example.com"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Separate multiple emails with commas, semicolons, or new lines. These addresses are copied on every automated follow-up for this conference.
                </p>
              </div>
                </div>
              </div>

              {/* Team Assignment */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">Team Assignment</h4>
                    <p className="text-sm text-gray-600">Assign conference to team members</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Team Lead Assignment */}
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center mb-4">
                      <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h5 className="text-sm font-semibold text-gray-900">Team Lead</h5>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Assign Team Lead
                      </label>
                      <select
                        name="assignedTeamLeadId"
                        value={formData.assignedTeamLeadId}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                      >
                        <option value="">Select Team Lead</option>
                        {users.filter(user => user.role === 'TeamLead').map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Team Lead will manage this conference</p>
                    </div>
                  </div>

                  {/* Members Assignment */}
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center mb-4">
                      <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                      <h5 className="text-sm font-semibold text-gray-900">Team Members</h5>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Assign Members
                      </label>
                      <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                        {(users || []).filter(user => user.role === 'Member').map(user => (
                          <label key={user.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={(formData.assignedMemberIds || []).includes(user.id)}
                              onChange={(e) => {
                                const memberId = user.id;
                                if (e.target.checked) {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedMemberIds: [...(prev.assignedMemberIds || []), memberId]
                                  }));
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedMemberIds: (prev.assignedMemberIds || []).filter(id => id !== memberId)
                                  }));
                                }
                              }}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">{user.name} ({user.email})</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Select members to work on this conference</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white resize-none"
                  placeholder="Enter conference description..."
                />
              </div>

              {/* Email Templates Section */}
              <div className="border-t border-gray-200 pt-8">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Email Templates</h3>
                  <p className="text-sm text-gray-600">Configure email templates for each stage of your conference workflow</p>
                </div>
                
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-800">
                        Initial Email
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        The initial email is sent manually via the Compose feature. After sending, you can add the client to start automated follow-ups.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Stage 1 Template Selection (Abstract Submission follow-ups) */}
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
                    <div className="flex items-center mb-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-blue-600 font-semibold text-sm">1</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Abstract Submission</h4>
                        <p className="text-xs text-gray-600">Stage 1 follow-up emails for abstract submissions</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {getTemplateSlots('stage1')
                        .map((templateId, index) => {
                        const actualIndex = index;
                        const selectedTemplate = templateId ? templatesById[templateId] : null;
                        return (
                          <div key={`stage1-slot-${actualIndex}`} className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Follow-up {index + 1}</p>
                                <p className="text-xs text-gray-500">Attempt #{index + 1}</p>
                              </div>
                              {selectedTemplate && (
                                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                  {selectedTemplate.name}
                                </span>
                              )}
                            </div>
                            <select
                              value={templateId}
                              onChange={(e) => handleTemplateSlotChange('stage1', actualIndex, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-sm"
                            >
                              <option value="">Select a template</option>
                              {stageTemplateOptions.stage1.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                            {selectedTemplate ? (
                              <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-100">
                                <p className="font-medium text-gray-800">Subject: {selectedTemplate.subject}</p>
                                <p className="mt-1 line-clamp-2">
                                  {selectedTemplate.bodyText || selectedTemplate.bodyHtml?.replace(/<[^>]*>/g, '')}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-gray-400">No template selected. The previous template will be reused.</p>
                            )}
                          </div>
                        );
                      })}
                      {stageTemplateOptions.stage1.length === 0 && (
                        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg p-3">
                          No Stage 1 templates available. Please create templates in the Templates page.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stage 2 Template Selection */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                    <div className="flex items-center mb-4">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-green-600 font-semibold text-sm">2</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Registration</h4>
                        <p className="text-xs text-gray-600">Final registration reminders</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {getTemplateSlots('stage2').map((templateId, index) => {
                        const selectedTemplate = templateId ? templatesById[templateId] : null;
                        return (
                          <div key={`stage2-slot-${index}`} className="bg-white border border-green-100 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Follow-up {index + 1}</p>
                                <p className="text-xs text-gray-500">Attempt #{index + 1}</p>
                              </div>
                              {selectedTemplate && (
                                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                  {selectedTemplate.name}
                                </span>
                              )}
                            </div>
                            <select
                              value={templateId}
                              onChange={(e) => handleTemplateSlotChange('stage2', index, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white text-sm"
                            >
                              <option value="">Select a template</option>
                              {stageTemplateOptions.stage2.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                            {selectedTemplate ? (
                              <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-100">
                                <p className="font-medium text-gray-800">Subject: {selectedTemplate.subject}</p>
                                <p className="mt-1 line-clamp-2">
                                  {selectedTemplate.bodyText || selectedTemplate.bodyHtml?.replace(/<[^>]*>/g, '')}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-gray-400">No template selected. The previous template will be reused.</p>
                            )}
                          </div>
                        );
                      })}
                      {stageTemplateOptions.stage2.length === 0 && (
                        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg p-3">
                          No Stage 2 templates available. Please create templates in the Templates page.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Template Management Section */}
                <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">Template Management</h4>
                        <p className="text-sm text-gray-600">Create and manage email templates for your campaigns</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = '/templates';
                      }}
                      className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 shadow-sm"
                    >
                      Manage Templates
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-sm flex items-center gap-2"
                >
                  {createMutation.isLoading || updateMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <CheckIcon className="h-4 w-4" />
                  )}
                  {editingConference ? 'Update Conference' : 'Create Conference'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewingConference && (() => {
        const settings = viewingConference.settings || {};
        const followupIntervals = settings.followup_intervals || {};
        const maxAttempts = settings.max_attempts || {};
        const workingHours = settings.working_hours || {};
        const abstractLink = settings.abstractSubmissionLink || '';
        const registrationLink = settings.registrationLink || '';
        const followupCC = Array.isArray(settings.followupCC) ? settings.followupCC : [];
        const stage1Templates = Array.isArray(settings.stage1Templates) ? settings.stage1Templates : [];
        const stage2Templates = Array.isArray(settings.stage2Templates) ? settings.stage2Templates : [];
        
        // Get user names for team assignments
        const assignedTeamLead = users.find(u => u.id === viewingConference.assignedTeamLeadId);
        const assignedMembers = Array.isArray(viewingConference.assignedMemberIds) 
          ? viewingConference.assignedMemberIds.map(id => users.find(u => u.id === id)).filter(Boolean)
          : [];
        
        // Get template names
        const stage1TemplateNames = stage1Templates.map(id => {
          const template = templatesById[id];
          return template ? template.name : `Template ${id}`;
        }).filter(Boolean);
        const stage2TemplateNames = stage2Templates.map(id => {
          const template = templatesById[id];
          return template ? template.name : `Template ${id}`;
        }).filter(Boolean);
        
        // Parse interval values
        const stage1Interval = followupIntervals.Stage1 || {};
        const stage2Interval = followupIntervals.Stage2 || {};
        const stage1IntervalValue = typeof stage1Interval === 'object' ? (stage1Interval.value || 7) : (stage1Interval || 7);
        const stage1IntervalUnit = typeof stage1Interval === 'object' ? (stage1Interval.unit || 'days') : 'days';
        const stage2IntervalValue = typeof stage2Interval === 'object' ? (stage2Interval.value || 3) : (stage2Interval || 3);
        const stage2IntervalUnit = typeof stage2Interval === 'object' ? (stage2Interval.unit || 'days') : 'days';
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Conference Details</h2>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Conference Name</span>
                      <p className="text-gray-900 font-medium mt-1">
                        {viewingConference.name}
                        {viewingConference.shortName && (
                          <span className="text-sm text-gray-500 ml-2">({viewingConference.shortName})</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Status</span>
                      <div className="mt-1">{getStatusBadge(viewingConference)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <span className="text-sm font-medium text-gray-500">Venue</span>
                        <p className="text-gray-900">{viewingConference.venue}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <span className="text-sm font-medium text-gray-500">Conference Dates</span>
                        <p className="text-gray-900">
                          {formatDate(viewingConference.startDate)} - {formatDate(viewingConference.endDate)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Currency</span>
                      <p className="text-gray-900">{viewingConference.currency || 'USD'}</p>
                    </div>
                    {viewingConference.website && (
                      <div className="flex items-center gap-2">
                        <GlobeAltIcon className="h-5 w-5 text-gray-400" />
                        <div>
                          <span className="text-sm font-medium text-gray-500">Website</span>
                          <p className="text-gray-900">
                            <a 
                              href={viewingConference.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {viewingConference.website}
                            </a>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {viewingConference.description && (
                    <div className="mt-4">
                      <span className="text-sm font-medium text-gray-500">Description</span>
                      <p className="text-gray-900 mt-1">{viewingConference.description}</p>
                    </div>
                  )}
                </div>

                {/* Deadlines and Links */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Deadlines & Links</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Abstract Deadline</span>
                      <p className="text-gray-900">{formatDate(viewingConference.abstractDeadline)}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Registration Deadline</span>
                      <p className="text-gray-900">{formatDate(viewingConference.registrationDeadline)}</p>
                    </div>
                    {abstractLink && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Abstract Submission Link</span>
                        <p className="text-gray-900">
                          <a href={abstractLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                            {abstractLink}
                          </a>
                        </p>
                      </div>
                    )}
                    {registrationLink && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Registration Link</span>
                        <p className="text-gray-900">
                          <a href={registrationLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                            {registrationLink}
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Team Assignment */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Assignment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Team Lead</span>
                      <p className="text-gray-900">
                        {assignedTeamLead ? `${assignedTeamLead.name} (${assignedTeamLead.email})` : 'Not assigned'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Team Members</span>
                      {assignedMembers.length > 0 ? (
                        <ul className="text-gray-900 mt-1 space-y-1">
                          {assignedMembers.map(member => (
                            <li key={member.id}>• {member.name} ({member.email})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500">No members assigned</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email Templates */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Templates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 1 (Abstract Submission)</span>
                      {stage1TemplateNames.length > 0 ? (
                        <ul className="text-gray-900 mt-1 space-y-1">
                          {stage1TemplateNames.map((name, idx) => (
                            <li key={idx}>{idx + 1}. {name}</li>
                          ))}
                        </ul>
                      ) : viewingConference.stage1TemplateId ? (
                        <p className="text-gray-900 mt-1">
                          {templatesById[viewingConference.stage1TemplateId]?.name || `Template ${viewingConference.stage1TemplateId}`}
                        </p>
                      ) : (
                        <p className="text-gray-500 mt-1">No template assigned</p>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 2 (Registration)</span>
                      {stage2TemplateNames.length > 0 ? (
                        <ul className="text-gray-900 mt-1 space-y-1">
                          {stage2TemplateNames.map((name, idx) => (
                            <li key={idx}>{idx + 1}. {name}</li>
                          ))}
                        </ul>
                      ) : viewingConference.stage2TemplateId ? (
                        <p className="text-gray-900 mt-1">
                          {templatesById[viewingConference.stage2TemplateId]?.name || `Template ${viewingConference.stage2TemplateId}`}
                        </p>
                      ) : (
                        <p className="text-gray-500 mt-1">No template assigned</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Follow-up Settings */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Follow-up Settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 1 Interval</span>
                      <p className="text-gray-900">{stage1IntervalValue} {stage1IntervalUnit}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 1 Max Follow-ups</span>
                      <p className="text-gray-900">{maxAttempts.Stage1 || 6}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 2 Interval</span>
                      <p className="text-gray-900">{stage2IntervalValue} {stage2IntervalUnit}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Stage 2 Max Follow-ups</span>
                      <p className="text-gray-900">{maxAttempts.Stage2 || 6}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Skip Weekends</span>
                      <p className="text-gray-900">{settings.skip_weekends !== false ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Timezone</span>
                      <p className="text-gray-900">{settings.timezone || 'UTC'}</p>
                    </div>
                    {workingHours.start && workingHours.end && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Working Hours</span>
                        <p className="text-gray-900">{workingHours.start} - {workingHours.end}</p>
                      </div>
                    )}
                    {followupCC.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Follow-up CC Emails</span>
                        <ul className="text-gray-900 mt-1 space-y-1">
                          {followupCC.map((email, idx) => (
                            <li key={idx}>• {email}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Close
                </button>
                {user?.role !== 'Member' && (
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      handleEdit(viewingConference);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingConference && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <TrashIcon className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Delete Conference</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deletingConference.name}"</strong>? 
              This will permanently remove the conference and all associated data.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingConference(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deleteMutation.isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <TrashIcon className="h-4 w-4" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Management Modal */}
      {showTemplateModal && templateConference && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Email Templates - {templateConference.name}
              </h2>
              <button
                onClick={handleCloseTemplateModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Stage Selection Tabs */}
            <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTemplateStage('stage1')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTemplateStage === 'stage1'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stage 1 - Abstract Submission
              </button>
              <button
                onClick={() => setActiveTemplateStage('stage2')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTemplateStage === 'stage2'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stage 2 - Registration
              </button>
            </div>

            <form onSubmit={handleTemplateSubmit} className="space-y-6">
              {/* Template Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={templateData[activeTemplateStage].subject}
                    onChange={handleTemplateChange}
                    placeholder="Enter email subject..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    HTML Body
                  </label>
                  <textarea
                    name="bodyHtml"
                    value={templateData[activeTemplateStage].bodyHtml}
                    onChange={handleTemplateChange}
                    rows={12}
                    placeholder="Enter HTML email body..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Text Body
                  </label>
                  <textarea
                    name="bodyText"
                    value={templateData[activeTemplateStage].bodyText}
                    onChange={handleTemplateChange}
                    rows={8}
                    placeholder="Enter plain text email body..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Available Variables */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Available Variables</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{client_name}}'}</code>
                    <span className="text-gray-600">Client name</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{conference_name}}'}</code>
                    <span className="text-gray-600">Conference name</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{conference_date}}'}</code>
                    <span className="text-gray-600">Conference date</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{conference_venue}}'}</code>
                    <span className="text-gray-600">Conference venue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{abstract_deadline}}'}</code>
                    <span className="text-gray-600">Abstract deadline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{registration_deadline}}'}</code>
                    <span className="text-gray-600">Registration deadline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{abstract_submission_link}}'}</code>
                    <span className="text-gray-600">Abstract submission link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{registration_link}}'}</code>
                    <span className="text-gray-600">Registration link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{conference_website}}'}</code>
                    <span className="text-gray-600">Conference website</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-200 px-2 py-1 rounded text-xs">{'{{unsubscribe_link}}'}</code>
                    <span className="text-gray-600">Unsubscribe link</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseTemplateModal}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateTemplatesMutation.isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {updateTemplatesMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <CheckIcon className="h-4 w-4" />
                  )}
                  Save Templates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConferenceManagement;