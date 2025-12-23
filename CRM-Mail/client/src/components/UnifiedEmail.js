import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import useRealtimeEmail from '../hooks/useRealtimeEmail';
import { useAuth } from '../contexts/AuthContext';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
  Mail,
  Send,
  Inbox,
  Archive,
  Trash2,
  Search,
  Plus,
  RefreshCw,
  Star,
  Reply,
  Forward,
  CheckCircle,
  AlertCircle,
  X,
  Pencil,
  File,
  Paperclip,
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  List,
  Link,
  Image,
  Maximize2,
  Download,
  Eye,
  Minimize2
} from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

// Register custom font whitelist for Quill so selected fonts actually apply
const Font = Quill.import('formats/font');
Font.whitelist = [
  'arial',
  'calistomt',
  'cambria',
  'couriernew',
  'georgia',
  'helvetica',
  'lucidasansunicode',
  'palatinolinotype',
  'tahoma',
  'timesnewroman',
  'trebuchetms',
  'verdana'
];
Quill.register(Font, true);

// Register numeric font sizes using style attributor (pixel values)
const SizeStyle = Quill.import('attributors/style/size');
SizeStyle.whitelist = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px'];
Quill.register(SizeStyle, true);

// Register line-height as style attributor using Parchment
// Use BLOCK scope so it applies to entire paragraphs (like Word)
const Parchment = Quill.import('parchment');
const LineHeightAttributor = new Parchment.Attributor.Style('line-height', 'line-height', {
  scope: Parchment.Scope.BLOCK,
  whitelist: ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0']
});
Quill.register(LineHeightAttributor, true);

// Register margin-bottom as style attributor using Parchment (paragraph spacing)
const MarginBottomAttributor = new Parchment.Attributor.Style('margin-bottom', 'margin-bottom', {
  scope: Parchment.Scope.BLOCK,
  whitelist: ['0', '0.5em', '1em', '1.5em', '2em', '2.5em', '3em']
});
Quill.register(MarginBottomAttributor, true);

// Register a custom Blot to preserve HTML content in contenteditable="false" divs
const BlockEmbed = Quill.import('blots/block/embed');
class PreservedHtmlBlot extends BlockEmbed {
  static create(value) {
    const node = super.create();
    node.setAttribute('contenteditable', 'false');
    node.setAttribute('data-quill-preserve', 'true');
    node.className = 'preserved-email-content';
    node.style.cssText = 'border-left: 3px solid #ccc; margin: 10px 0; padding: 10px 0 10px 15px; background-color: #f9f9f9; overflow-x: auto; width: 100%; box-sizing: border-box; display: block;';
    if (typeof value === 'string') {
      node.innerHTML = value;
    }
    return node;
  }
  
  static value(node) {
    return node.innerHTML;
  }
}
PreservedHtmlBlot.blotName = 'preserved-html';
PreservedHtmlBlot.tagName = 'div';
PreservedHtmlBlot.className = 'preserved-email-content';
Quill.register(PreservedHtmlBlot);

const UnifiedEmail = () => {
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const isCeo = (user?.role || '').toLowerCase() === 'ceo';
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [activeEmailAccountId, setActiveEmailAccountId] = useState('all');
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState(null);
  const [filters, setFilters] = useState({
    fromEmail: '',
    toEmail: '',
    startDate: '',
    endDate: ''
  });
  
  const { 
    isConnected, 
    newEmailsCount, 
    triggerSync, 
    clearNewEmailsCount 
  } = useRealtimeEmail(user?.id);

  const [composeData, setComposeData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: []
  });
  const [editingDraftId, setEditingDraftId] = useState(null); // Track which draft is being edited

  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionInput, setSuggestionInput] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isComposeMaximized, setIsComposeMaximized] = useState(false);
  const [showCC, setShowCC] = useState(false);
  const [showBCC, setShowBCC] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [showDraftConfirm, setShowDraftConfirm] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState(null); // 'close' or 'discard'
  const [isSending, setIsSending] = useState(false); // Track sending state to prevent multiple clicks
  const quillEditorRef = useRef(null); // Ref for ReactQuill editor to set HTML content properly
  const [pendingReplyHtml, setPendingReplyHtml] = useState(null); // Store HTML to set after editor mounts
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [addClientData, setAddClientData] = useState({
    name: '',
    email: '',
    country: '',
    conferenceId: '',
    threadRootMessageId: '',
    initialEmailSubject: ''
  });

  const focusEditor = () => {
    const ed = quillEditorRef.current?.getEditor?.();
    const root = ed?.root;
    if (ed && root && root.isConnected) {
      root.setAttribute('contenteditable', 'true');
      root.style.pointerEvents = 'auto';
      root.style.userSelect = 'text';
      try {
        // Only focus, don't try to set selection - let Quill handle it naturally
        // Setting selection too early causes "addRange(): The given range isn't in document" errors
        if (document.activeElement !== root) {
          root.focus();
        }
      } catch (e) {
        // ignore focus errors
      }
    }
  };

  const ensureEditorActive = () => {
    // Try multiple ways to access the Quill editor instance
    let editor = null;
    if (quillEditorRef.current) {
      // ReactQuill exposes getEditor() method
      if (typeof quillEditorRef.current.getEditor === 'function') {
        editor = quillEditorRef.current.getEditor();
      }
      // Alternative: access via internal structure
      if (!editor && quillEditorRef.current.editor) {
        editor = quillEditorRef.current.editor;
      }
      // Try accessing via the underlying Quill instance
      if (!editor && quillEditorRef.current.quill) {
        editor = quillEditorRef.current.quill;
      }
    }
    
    if (editor) {
      // Enable the editor
      if (typeof editor.enable === 'function') {
        try {
          editor.enable(true);
        } catch (e) {
          // Editor might already be enabled
        }
      }
      
      // Ensure contenteditable is set
      const root = editor.root || editor.container?.querySelector('.ql-editor');
      if (root && root.isConnected) {
        root.setAttribute('contenteditable', 'true');
        root.style.pointerEvents = 'auto';
        root.style.userSelect = 'text';
        root.style.webkitUserSelect = 'text';
        root.style.mozUserSelect = 'text';
        root.style.msUserSelect = 'text';
      }
    } else {
      // Fallback: directly access DOM element
      const editorElement = document.querySelector('.compose-editor .ql-editor');
      if (editorElement && editorElement.isConnected) {
        editorElement.setAttribute('contenteditable', 'true');
        editorElement.style.pointerEvents = 'auto';
        editorElement.style.userSelect = 'text';
        editorElement.style.webkitUserSelect = 'text';
        editorElement.style.mozUserSelect = 'text';
        editorElement.style.msUserSelect = 'text';
      }
    }
  };

  // Manual fallback to force-enable and focus the editor (used by help button)
  const forceEnableEditor = () => {
    ensureEditorActive();
    const editorElement = document.querySelector('.compose-editor .ql-editor');
    if (editorElement && editorElement.isConnected) {
      editorElement.setAttribute('contenteditable', 'true');
      editorElement.style.pointerEvents = 'auto';
      editorElement.style.userSelect = 'text';
      try {
        editorElement.focus();
      } catch (e) {
        // ignore focus errors
      }
    }
  };

  // Stronger force: enable Quill, focus root, and set selection safely
  const forceFocusAndEnableEditor = () => {
    const quill = quillEditorRef.current?.getEditor?.();
    const root = quill?.root || document.querySelector('.compose-editor .ql-editor');
    if (quill) {
      try {
        quill.enable(true);
      } catch (_) {}
    }
    if (root && root.isConnected) {
      root.setAttribute('contenteditable', 'true');
      root.style.pointerEvents = 'auto';
      root.style.userSelect = 'text';
      try {
        root.focus();
      } catch (_) {}
    }
    if (quill) {
      try {
        const len = quill.getLength();
        const safeIndex = Math.max(0, Math.min(len - 1, len));
        quill.setSelection(safeIndex, 0, 'user');
      } catch (_) {}
    }
  };

  // ULTIMATE FIX: Intercept ReactQuill at the source to prevent toolbar hiding
  useEffect(() => {
    if (!showCompose) return;
    
    let checkInterval = null;
    let mutationObserver = null;
    let toolbarElement = null;
    
    // Aggressive function that ALWAYS forces toolbar to be visible
    const forceToolbarVisible = () => {
      toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
      if (!toolbarElement) return;
      
      // CRITICAL: Use cssText to completely replace all styles - this can't be overridden
      const originalCssText = toolbarElement.style.cssText;
      toolbarElement.style.cssText = `
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        height: auto !important;
        min-height: 42px !important;
        max-height: none !important;
        overflow: visible !important;
        position: relative !important;
        z-index: 10 !important;
      `;
      
      // Remove ALL hiding classes immediately
      toolbarElement.classList.remove('ql-hidden', 'hidden', 'invisible', 'd-none', 'ql-snow');
      toolbarElement.classList.add('ql-snow'); // Ensure it has the required class
      
      // Force all toolbar children visible EXCEPT dropdown menus (they should be controlled by .ql-expanded)
      const children = toolbarElement.querySelectorAll('button, .ql-picker, .ql-formats, .ql-picker-label, span');
      children.forEach(child => {
        // Skip picker options - they should be controlled by .ql-expanded class
        if (child.classList && child.classList.contains('ql-picker-options')) {
          return; // Don't force visibility on dropdown menus - let CSS handle it
        }
        if (child.style) {
          const computed = window.getComputedStyle(child);
          // Only force visibility if it's not a dropdown menu
          if (!child.closest('.ql-picker-options') && 
              (computed.display === 'none' || computed.visibility === 'hidden' || parseFloat(computed.opacity) < 0.1)) {
            child.style.cssText = `
              display: inline-block !important;
              visibility: visible !important;
              opacity: 1 !important;
              pointer-events: auto !important;
            `;
          }
        }
      });
      
      // Ensure dropdown menus respect their expanded state - don't interfere with ReactQuill's toggle
      const pickerOptions = toolbarElement.querySelectorAll('.ql-picker-options');
      pickerOptions.forEach(options => {
        const picker = options.closest('.ql-picker');
        if (picker) {
          const isExpanded = picker.classList.contains('ql-expanded');
          const computed = window.getComputedStyle(options);
          
          if (isExpanded) {
            // If expanded, ensure it's visible (only if it was hidden by our code)
            if (computed.display === 'none' || computed.visibility === 'hidden') {
              // Only restore if it was our code that hid it - let ReactQuill handle normal behavior
              options.style.removeProperty('display');
              options.style.removeProperty('visibility');
              options.style.removeProperty('opacity');
              options.style.removeProperty('pointer-events');
            }
          } else {
            // If not expanded, ensure it's hidden (but don't override if ReactQuill is animating)
            if (computed.display !== 'none' && computed.visibility !== 'hidden') {
              options.style.setProperty('display', 'none', 'important');
              options.style.setProperty('visibility', 'hidden', 'important');
              options.style.setProperty('opacity', '0', 'important');
              options.style.setProperty('pointer-events', 'none', 'important');
            }
          }
        }
      });
    };
    
    // Intercept style changes using MutationObserver
    const setupMutationObserver = () => {
      const composeEditor = document.querySelector('.compose-editor');
      if (!composeEditor) return;
      
      mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            const target = mutation.target;
            if (target === toolbarElement || (toolbarElement && toolbarElement.contains(target))) {
              // Check if toolbar is being hidden
              const computed = window.getComputedStyle(toolbarElement);
              if (computed.display === 'none' || computed.visibility === 'hidden' || parseFloat(computed.opacity) < 0.1) {
                // Immediately restore
                forceToolbarVisible();
              }
              // Also check if style attribute was changed
              if (mutation.attributeName === 'style' && target === toolbarElement) {
                // ReactQuill might have changed styles - restore immediately
                forceToolbarVisible();
              }
            }
          }
          // Check if toolbar was removed from DOM
          if (mutation.type === 'childList') {
            const removedNodes = Array.from(mutation.removedNodes);
            if (removedNodes.some(node => node === toolbarElement || (node.nodeType === 1 && node.classList?.contains('ql-toolbar')))) {
              // Toolbar was removed - wait a bit and check if it's back
              setTimeout(() => {
                const newToolbar = document.querySelector('.compose-editor .ql-toolbar');
                if (newToolbar) {
                  toolbarElement = newToolbar;
                  forceToolbarVisible();
                }
              }, 10);
            }
          }
        });
      });
      
      mutationObserver.observe(composeEditor, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        childList: true,
        subtree: true
      });
    };
    
    // Override Object.defineProperty on toolbar element to prevent style changes
    const protectToolbarStyles = () => {
      if (!toolbarElement) return;
      
      try {
        // Store original style object
        const originalStyle = toolbarElement.style;
        
        // Override style.setProperty to always force visibility
        const originalSetProperty = originalStyle.setProperty.bind(originalStyle);
        originalStyle.setProperty = function(property, value, priority) {
          if (property === 'display' && value === 'none') {
            return; // Block hiding
          }
          if (property === 'visibility' && value === 'hidden') {
            return; // Block hiding
          }
          if (property === 'opacity' && parseFloat(value) < 0.1) {
            return; // Block hiding
          }
          return originalSetProperty(property, value, priority);
        };
        
        // Override cssText setter
        Object.defineProperty(originalStyle, 'cssText', {
          get: function() {
            return this._cssText || '';
          },
          set: function(value) {
            this._cssText = value;
            // If trying to hide, ignore it
            if (value && (value.includes('display: none') || value.includes('display:none') || 
                value.includes('visibility: hidden') || value.includes('visibility:hidden'))) {
              return;
            }
            // Otherwise apply but ensure visibility
            originalStyle.setProperty('display', 'flex', 'important');
            originalStyle.setProperty('visibility', 'visible', 'important');
            originalStyle.setProperty('opacity', '1', 'important');
          },
          configurable: true
        });
      } catch (e) {
        // If we can't override, just use the interval method
        console.warn('Could not protect toolbar styles:', e);
      }
    };
    
    // Wait for ReactQuill to mount
    const initTimer = setTimeout(() => {
      toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
      if (toolbarElement) {
        forceToolbarVisible();
        protectToolbarStyles();
        setupMutationObserver();
        
        // Continuous checking as backup
        checkInterval = setInterval(forceToolbarVisible, 5); // Every 5ms - very aggressive
      }
    }, 100);
    
    // Patch Quill instance
    const quillTimer = setTimeout(() => {
      const quill = quillEditorRef.current?.getEditor?.();
      if (quill && !quill.__toolbarVisibilityPatched) {
        // Listen to ALL events
        quill.on('text-change', forceToolbarVisible);
        quill.on('selection-change', forceToolbarVisible);
        quill.on('editor-change', forceToolbarVisible);
        
        // Override Quill's focus/blur handlers if possible
        const container = quill.container;
        if (container) {
          const originalBlur = container.onblur;
          container.onblur = function(e) {
            // Don't let blur hide toolbar
            if (originalBlur) originalBlur.call(this, e);
            setTimeout(forceToolbarVisible, 0);
          };
        }
        
        quill.__toolbarVisibilityPatched = true;
      }
      
      // Patch selection methods
      if (quill && !quill.__safeSelectionPatched) {
        const isEditorReady = () => {
          try {
            const root = quill.root || quill.container?.querySelector('.ql-editor');
            return root && root.isConnected && Number.isFinite(quill.getLength());
          } catch {
            return false;
          }
        };
        
        const origSetSelection = quill.setSelection?.bind(quill);
        if (origSetSelection) {
          quill.setSelection = (index = 0, length = 0, source) => {
            try {
              if (!isEditorReady()) return;
              const len = quill.getLength();
              const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, len - 1)));
              const safeLength = Math.max(0, Math.min(Number(length) || 0, Math.max(0, len - safeIndex)));
              if (!Number.isFinite(safeIndex) || !Number.isFinite(safeLength)) return;
              const result = origSetSelection(safeIndex, safeLength, source);
              forceToolbarVisible();
              return result;
            } catch (e) {
              return;
            }
          };
        }
        
        quill.__safeSelectionPatched = true;
      }
    }, 200);
    
    return () => {
      clearTimeout(initTimer);
      clearTimeout(quillTimer);
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
    };
  }, [showCompose]);

  // Prevent background scroll when compose window is open (like Gmail)
  useEffect(() => {
    if (showCompose) {
      const originalOverflow = document.body.style.overflow;
      document.body.dataset.prevOverflow = originalOverflow;
      document.body.style.overflow = 'hidden';
    } else if (document.body.dataset.prevOverflow !== undefined) {
      document.body.style.overflow = document.body.dataset.prevOverflow;
      delete document.body.dataset.prevOverflow;
    }

    return () => {
      if (document.body.dataset.prevOverflow !== undefined) {
        document.body.style.overflow = document.body.dataset.prevOverflow;
        delete document.body.dataset.prevOverflow;
      }
    };
  }, [showCompose]);

  const { data: emailsData, isLoading, refetch } = useQuery(
    ['emails', activeFolder, searchTerm, currentPage, filters, activeEmailAccountId], 
    async () => {
      try {
      const params = new URLSearchParams();
      if (activeFolder) {
        params.append('folder', activeFolder);
      }
      if (searchTerm) {
          params.append('search', searchTerm.trim().substring(0, 200)); // Sanitize search
      }
      params.append('page', currentPage);
      params.append('limit', 50);
      
      if (filters.fromEmail) {
          params.append('fromEmail', filters.fromEmail.trim().substring(0, 200));
      }
      if (filters.toEmail) {
          params.append('toEmail', filters.toEmail.trim().substring(0, 200));
      }
      if (filters.startDate) {
        params.append('startDate', filters.startDate);
      }
      if (filters.endDate) {
        params.append('endDate', filters.endDate);
      }
        if (activeEmailAccountId && activeEmailAccountId !== 'all') {
          params.append('accountId', activeEmailAccountId);
      }
      
      const response = await axios.get(`/api/emails?${params.toString()}`);
      return response.data;
      } catch (error) {
        console.error('Error fetching emails:', error);
        // Return safe default data structure
        return {
          emails: [],
          pagination: {
            total: 0,
            page: currentPage,
            limit: 50,
            pages: 0,
            hasMore: false
          }
        };
      }
    },
    {
      onError: (error) => {
        console.error('Email query error:', error);
        toast.error('Failed to load emails. Please try again.');
      },
      retry: 1
    }
  );

  const emails = React.useMemo(() => {
    if (!emailsData) return [];
    if (Array.isArray(emailsData)) return emailsData;
    if (emailsData?.emails) return emailsData.emails;
    return [];
  }, [emailsData]);

  const { data: templates = [] } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  const { data: clients = [] } = useQuery('clients-for-email', async () => {
    const response = await axios.get('/api/clients/for-email');
    return response.data;
  });

  // Fetch conferences to determine which SMTP accounts user can access
  const { data: assignedConferences = [] } = useQuery('conferences', async () => {
    try {
      const response = await axios.get('/api/conferences');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching conferences:', error);
      return [];
    }
  }, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: emailAccounts = [], isLoading: emailAccountsLoading } = useQuery('email-accounts', async () => {
    const response = await axios.get('/api/email-accounts');
    const accounts = response.data || [];
    console.log('📧 Fetched email accounts from backend:', {
      count: accounts.length,
      accounts: accounts.map(acc => ({ 
        id: acc.id, 
        name: acc.name, 
        email: acc.email, 
        type: acc.type,
        isSystemAccount: acc.isSystemAccount,
        ownerId: acc.ownerId
      }))
    });
    return accounts;
  });

  const sortedEmailAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(emailAccounts) ? emailAccounts : [];
    return [...accountsArray].sort((a, b) => {
      const priorityA = a.sendPriority ?? 1000;
      const priorityB = b.sendPriority ?? 1000;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdAtA - createdAtB;
    });
  }, [emailAccounts]);

  // Extract SMTP account IDs from assigned conferences
  const allowedSmtpAccountIds = React.useMemo(() => {
    if (isCeo) {
      // CEO can see all accounts
      return null; // null means no filtering
    }

    const smtpIds = new Set();
    const conferencesArray = Array.isArray(assignedConferences) ? assignedConferences : [];
    
    conferencesArray.forEach(conference => {
      try {
        // Extract smtp_default_id from conference settings
        const settings = conference.settings || {};
        const smtpId = settings.smtp_default_id;
        if (smtpId && (typeof smtpId === 'string' || typeof smtpId === 'number')) {
          smtpIds.add(String(smtpId));
        }
      } catch (error) {
        console.error('Error extracting SMTP ID from conference:', error);
      }
    });

    return smtpIds.size > 0 ? Array.from(smtpIds) : [];
  }, [assignedConferences, isCeo]);

  const groupedEmailAccounts = React.useMemo(() => {
    const accountsArray = Array.isArray(sortedEmailAccounts) ? sortedEmailAccounts : [];
    const shared = accountsArray.filter(account => account.isSystemAccount);
    const mine = accountsArray.filter(account => !account.isSystemAccount && account.ownerId === currentUserId);
    const others = accountsArray.filter(account => !account.isSystemAccount && account.ownerId && account.ownerId !== currentUserId);
    return { shared, mine, others };
  }, [sortedEmailAccounts, currentUserId]);

  const visibleEmailAccounts = React.useMemo(() => {
    // The backend /api/email-accounts already filters accounts based on user role and conference assignments
    // So we can trust the backend filtering and use all accounts returned
    // Only filter to show SMTP-capable accounts (type === 'smtp' or type === 'both')
    const allAccounts = [
      ...groupedEmailAccounts.shared,
      ...groupedEmailAccounts.mine,
      ...groupedEmailAccounts.others
    ];

    // Filter to only SMTP-capable accounts (can send emails)
    const smtpAccounts = allAccounts.filter(account => {
      return account.type === 'smtp' || account.type === 'both';
    });

    // Debug logging
    console.log('📧 Visible Email Accounts:', {
      totalAccounts: allAccounts.length,
      smtpAccounts: smtpAccounts.length,
      accounts: smtpAccounts.map(acc => ({ id: acc.id, name: acc.name, email: acc.email, type: acc.type }))
    });

    return smtpAccounts;
  }, [groupedEmailAccounts]);

  React.useEffect(() => {
    if (!visibleEmailAccounts.length) {
      setSelectedEmailAccountId(null);
      return;
    }
    setSelectedEmailAccountId((prev) => {
      if (prev && visibleEmailAccounts.some(acc => acc.id === prev)) {
        return prev;
      }
      return visibleEmailAccounts[0].id;
    });
    setActiveEmailAccountId((prev) => {
      if (prev === 'all') return prev;
      if (visibleEmailAccounts.some(acc => acc.id === prev)) {
        return prev;
      }
      return visibleEmailAccounts[0].id;
    });
  }, [visibleEmailAccounts]);

  // Ensure an account is selected when compose modal opens
  React.useEffect(() => {
    if (showCompose && visibleEmailAccounts.length > 0 && !selectedEmailAccountId) {
      // If compose is open but no account selected, select the first available account
      setSelectedEmailAccountId(visibleEmailAccounts[0].id);
    }
  }, [showCompose, visibleEmailAccounts, selectedEmailAccountId]);

  React.useEffect(() => {
    if (showCompose) return;
    if (activeEmailAccountId !== 'all' && visibleEmailAccounts.some(acc => acc.id === activeEmailAccountId)) {
      setSelectedEmailAccountId(activeEmailAccountId);
    }
  }, [activeEmailAccountId, showCompose, visibleEmailAccounts]);

  // Fetch email suggestions for autocomplete
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery(
    ['email-suggestions', suggestionInput],
    async () => {
      if (!suggestionInput || suggestionInput.length < 2) {
        return [];
      }
      try {
        const response = await axios.get(`/api/emails/suggestions?query=${encodeURIComponent(suggestionInput)}`);
        return response.data || [];
      } catch (error) {
        console.error('Error fetching email suggestions:', error);
        return [];
      }
    },
    {
      enabled: Boolean(suggestionInput && suggestionInput.length >= 2),
      staleTime: 30000, // Cache for 30 seconds
    }
  );

  React.useEffect(() => {
    if (suggestionsData) {
      setEmailSuggestions(suggestionsData);
      setShowSuggestions(suggestionsData.length > 0 && suggestionInput.length >= 2);
    } else {
      setEmailSuggestions([]);
      if (!suggestionInput || suggestionInput.length < 2) {
        setShowSuggestions(false);
      }
    }
  }, [suggestionsData, suggestionInput]);

  const queryClient = useQueryClient();

  // Mutation for marking email as read
  const markAsReadMutation = useMutation(
    async (emailId) => {
      const response = await axios.put(`/api/emails/${emailId}`, { 
        isRead: true
      });
    return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['emails', activeFolder, searchTerm, currentPage, filters, activeEmailAccountId]);
        if (selectedEmail && selectedEmail.id === data.id) {
          // Update selected email in local state
          setSelectedEmail({ ...selectedEmail, isRead: true });
        }
      },
      onError: (error) => {
        console.error('Failed to mark email as read:', error);
        // Don't show error toast - this is a background operation
      }
    }
  );

  // Mutation for marking email as starred (toggle)
  const starEmailMutation = useMutation(
    async (emailId) => {
      const currentEmail = emails.find(e => e.id === emailId);
      const newStarredState = !currentEmail?.isStarred;
      
      // Update via PUT endpoint
      const response = await axios.put(`/api/emails/${emailId}`, { 
        isStarred: newStarredState
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['emails', activeFolder]);
        if (selectedEmail) {
          // Update selected email in local state
          setSelectedEmail({ ...selectedEmail, isStarred: data.isStarred });
        }
        toast.success(data.isStarred ? 'Email starred' : 'Email unstarred');
      },
      onError: (error) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to update email';
        toast.error(errorMessage);
      }
    }
  );

  // Mutation for archiving email
  const archiveEmailMutation = useMutation(
    async (emailId) => {
      // Archive by updating folder directly via API
      const response = await axios.put(`/api/emails/${emailId}`, { 
        folder: 'archive'
      });
      return response.data;
    },
    {
    onSuccess: () => {
        queryClient.invalidateQueries(['emails', activeFolder]);
        toast.success('Email archived');
        setSelectedEmail(null); // Close email view
      },
      onError: (error) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to archive email';
        toast.error(errorMessage);
      }
    }
  );

  // Mutation for deleting email
  const deleteEmailMutation = useMutation(
    async (emailId) => {
      const response = await axios.delete('/api/emails', { 
        data: { emailIds: [emailId] } 
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['emails', activeFolder]);
        toast.success('Email moved to trash');
        setSelectedEmail(null); // Close email view
      },
      onError: (error) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to delete email';
        toast.error(errorMessage);
      }
    }
  );

  // Permanent delete mutation for drafts
  const deleteDraftMutation = useMutation(
    async (emailId) => {
      const response = await axios.delete('/api/emails/permanent', { 
        data: { emailIds: [emailId] } 
      });
      return response.data;
    },
    {
      onSuccess: (data, emailId) => {
        queryClient.invalidateQueries(['emails', activeFolder]);
        toast.success('Draft deleted permanently');
        setSelectedEmail(null); // Close email view
        // If we were editing this draft, close compose modal
        if (editingDraftId === emailId) {
      setShowCompose(false);
      resetComposeData();
        }
      },
      onError: () => {
        toast.error('Failed to delete draft');
      }
    }
  );

  // Note: sendEmailMutation is not used - handleSendEmail directly calls axios.post
  // The post-send "Add Client" flow is handled in handleSendEmail's success handler

  const saveDraftMutation = useMutation(
    async () => {
      // Get email account (same logic as handleSendEmail)
      if (emailAccountsLoading || !emailAccounts || (Array.isArray(emailAccounts) && emailAccounts.length === 0)) {
        throw new Error('No email account configured');
      }

      const accountsArray = visibleEmailAccounts;
      if (accountsArray.length === 0) {
        throw new Error('No email account configured');
      }

      const preferredAccount = accountsArray.find(acc => acc.id === selectedEmailAccountId) || accountsArray[0];
      const accountId = preferredAccount?.id || preferredAccount?.emailAccountId;

      if (!accountId) {
        throw new Error('Invalid email account configuration');
      }

      if (preferredAccount && preferredAccount.isActive === false) {
        throw new Error('Selected SMTP account is paused. Please activate it or choose another.');
      }

      // Prepare FormData
      const formData = new FormData();
      formData.append('emailAccountId', String(accountId));
      formData.append('to', (composeData.to || '').trim());
      formData.append('cc', (composeData.cc || '').trim());
      formData.append('bcc', (composeData.bcc || '').trim());
      formData.append('subject', (composeData.subject || '').trim());

      let bodyHtml = composeData.body || '';
      if (!bodyHtml || bodyHtml.trim() === '<p><br></p>' || bodyHtml.trim() === '<p></p>') {
        bodyHtml = '';
      }
      formData.append('bodyHtml', bodyHtml);
      formData.append('bodyText', bodyHtml.replace(/<[^>]*>/g, '').trim() || '');

      // Append attachments
      attachmentFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      // If editing existing draft, update it instead of creating new one
      if (editingDraftId) {
        // Update existing draft
        formData.append('draftId', editingDraftId);
        const response = await axios.put(`/api/emails/draft/${editingDraftId}`, formData);
        return response.data;
      } else {
        // Create new draft
        const response = await axios.post('/api/emails/draft', formData);
        return response.data;
      }
    },
    {
      onSuccess: () => {
        toast.success(editingDraftId ? 'Draft updated successfully' : 'Draft saved successfully');
        setShowCompose(false);
        resetComposeData();
        setShowDraftConfirm(false);
        setPendingCloseAction(null);
      refetch();
    },
    onError: (error) => {
        const errorMessage = error.response?.data?.error || error.message || 'Failed to save draft';
      toast.error(errorMessage);
    }
    }
  );

  const syncEmailMutation = useMutation(async () => {
    const response = await axios.post('/api/emails/sync', { daysBack: 365 });
    return response.data;
  }, {
    onSuccess: (data) => {
      toast.success(`Synced ${data.totalSynced} emails`);
      refetch();
      setIsSyncing(false);
    },
    onError: (error) => {
      toast.error('Failed to sync emails');
      setIsSyncing(false);
    }
  });

  const handleToInputChange = (e) => {
    const value = e.target.value;
    setComposeData({ ...composeData, to: value });
    
    // Extract the last email address or current typing
    const parts = value.split(',').map(p => p.trim());
    const currentInput = parts[parts.length - 1];
    
    if (currentInput && currentInput.length >= 2) {
      setSuggestionInput(currentInput);
      setActiveSuggestionIndex(-1);
    } else {
      setSuggestionInput('');
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    // Replace the last part with the selected email
    const parts = composeData.to.split(',').map(p => p.trim());
    parts.pop(); // Remove the current typing
    const newTo = [...parts, suggestion.email].join(', ').trim();
    setComposeData({ ...composeData, to: newTo });
    setShowSuggestions(false);
    setSuggestionInput('');
    setActiveSuggestionIndex(-1);
  };

  const handleToInputKeyDown = (e) => {
    if (showSuggestions && emailSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => 
          prev < emailSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
        e.preventDefault();
        handleSuggestionSelect(emailSuggestions[activeSuggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    }
  };

  const handleToInputBlur = () => {
    // Delay hiding suggestions to allow click on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 250);
  };

  const handleAttachmentChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachmentFiles(prev => [...prev, ...files]);
    // Store file objects for later upload
    const fileObjects = files.map(file => ({
      filename: file.name,
      size: file.size,
      type: file.type,
      file: file // Keep file object for FormData
    }));
    setComposeData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...fileObjects]
    }));
  };

  const handleRemoveAttachment = (index) => {
    setAttachmentFiles(prev => prev.filter((_, i) => i !== index));
    setComposeData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const hasComposeContent = () => {
    const hasTo = composeData.to && composeData.to.trim().length > 0;
    const hasSubject = composeData.subject && composeData.subject.trim().length > 0;
    const hasBody = composeData.body && 
      composeData.body.trim().length > 0 && 
      composeData.body.trim() !== '<p><br></p>' && 
      composeData.body.trim() !== '<p></p>';
    const hasAttachments = attachmentFiles && attachmentFiles.length > 0;
    return hasTo || hasSubject || hasBody || hasAttachments;
  };

  const resetComposeData = () => {
    setIsSending(false); // Reset sending state when compose data is reset
    setComposeData({
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      attachments: []
    });
    setEmailSuggestions([]);
    setShowSuggestions(false);
    setSuggestionInput('');
    setActiveSuggestionIndex(-1);
    setAttachmentFiles([]);
    setShowCC(false);
    setShowBCC(false);
    setIsComposeMaximized(false);
    setEditingDraftId(null); // Clear draft editing state
    setPendingReplyHtml(null); // Clear pending HTML
  };

  // Effect to set HTML content when editor is ready
  useEffect(() => {
    if (pendingReplyHtml && quillEditorRef.current && showCompose) {
      // Small delay to ensure editor is fully mounted
      const timer = setTimeout(() => {
        const quill = quillEditorRef.current?.getEditor();
        if (quill && quill.clipboard) {
          try {
            // Use dangerouslyPasteHTML - this bypasses some processing
            // The contenteditable="false" wrapper should help preserve inner structure
            const range = quill.getSelection(true);
            const index = range ? range.index : 0;
            
            quill.clipboard.dangerouslyPasteHTML(index, pendingReplyHtml, 'user');
            
            setPendingReplyHtml(null);
          } catch (error) {
            console.error('Error setting HTML content:', error);
            // Fallback: set via value prop
            setComposeData(prev => ({ ...prev, body: pendingReplyHtml }));
            setPendingReplyHtml(null);
          }
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [pendingReplyHtml, showCompose]);

  const handleSync = async () => {
    setIsSyncing(true);
    syncEmailMutation.mutate();
  };

  const handleSendEmail = async () => {
    // Prevent multiple clicks
    if (isSending) {
      toast.error('Email is already being sent. Please wait...');
      return;
    }
    
    // Validate required fields
    if (!composeData.to || !composeData.to.trim()) {
      toast.error('Please enter a recipient email address');
      return;
    }
    
    if (!composeData.subject || !composeData.subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    
    // Check if emailAccounts is loading
    if (emailAccountsLoading) {
      toast.error('Loading email accounts, please wait...');
      return;
    }
    
    // Check if emailAccounts is loaded
    if (!emailAccounts || (Array.isArray(emailAccounts) && emailAccounts.length === 0)) {
      toast.error('No email account configured. Please add an email account first.');
      return;
    }
    
    let accountsArray = visibleEmailAccounts;

    if (accountsArray.length === 0) {
      toast.error('No email account configured. Please add an email account first.');
      return;
    }
    
    const preferredAccount = accountsArray.find(acc => acc.id === selectedEmailAccountId) || accountsArray[0];
    const accountId = preferredAccount?.id || preferredAccount?.emailAccountId;
    if (!accountId) {
      console.error('Email account structure:', preferredAccount);
      console.error('Available email accounts:', accountsArray);
      toast.error('Invalid email account configuration. Please check your email account settings.');
      return;
    }

    if (preferredAccount && preferredAccount.isActive === false) {
      toast.error('Selected SMTP account is paused. Please activate it or choose another account.');
      return;
    }
    
    try {
      // Prepare trimmed values
      const toEmail = composeData.to.trim();
      const subjectText = composeData.subject.trim();
      const ccEmail = (composeData.cc || '').trim();
      const bccEmail = (composeData.bcc || '').trim();
      
      // Ensure bodyHtml has content (ReactQuill might return empty string or just <p><br></p>)
      let bodyHtml = composeData.body || '';
      if (bodyHtml && bodyHtml.trim() && bodyHtml.trim() !== '<p><br></p>' && bodyHtml.trim() !== '<p></p>') {
        bodyHtml = bodyHtml.trim();
      } else {
        bodyHtml = '<p></p>';
      }
      
      const bodyText = bodyHtml.replace(/<[^>]*>/g, '').trim() || ' ';
      
      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('emailAccountId', String(accountId));
      formData.append('to', toEmail);
      formData.append('cc', ccEmail);
      formData.append('bcc', bccEmail);
      formData.append('subject', subjectText);
      formData.append('bodyHtml', bodyHtml);
      formData.append('bodyText', bodyText);
      
      // Append attachments
      attachmentFiles.forEach((file) => {
        formData.append('attachments', file);
      });
      
      // Log what we're sending for debugging - expand the object
      console.log('=== Frontend: Sending Email ===');
      console.log('Email Account ID:', accountId, typeof accountId);
      console.log('To:', toEmail);
      console.log('Subject:', subjectText);
      console.log('CC:', ccEmail);
      console.log('BCC:', bccEmail);
      console.log('Body HTML length:', bodyHtml.length);
      console.log('Body Text length:', bodyText.length);
      console.log('Attachments count:', attachmentFiles.length);
      console.log('FormData keys:', Array.from(formData.keys()));
      
      // Log FormData entries with detailed info
      for (let pair of formData.entries()) {
        const value = pair[1];
        // Check if it's a File object using a safer method
        const isFile = value && typeof value === 'object' && value.constructor && value.constructor.name === 'File';
        if (isFile) {
          console.log(`FormData[${pair[0]}]:`, `[File: ${value.name}, size: ${value.size} bytes]`);
        } else {
          const valuePreview = typeof value === 'string' && value.length > 100 
            ? value.substring(0, 100) + '...' 
            : value;
          console.log(`FormData[${pair[0]}]:`, valuePreview, `(type: ${typeof value}, length: ${value?.length || 'N/A'})`);
        }
      }
      console.log('==============================');
      
      // Set sending state to prevent multiple clicks
      setIsSending(true);
      
      // Don't set Content-Type header - let axios set it automatically with boundary
      const response = await axios.post('/api/emails/send', formData);
      
      // If we were editing a draft, delete it after successful send
      if (editingDraftId) {
        try {
          await axios.delete(`/api/emails/${editingDraftId}`);
          console.log('Draft deleted after sending');
        } catch (deleteError) {
          console.error('Failed to delete draft after sending:', deleteError);
          // Don't show error to user - email was sent successfully
        }
      }
      
      toast.success('Email sent successfully');
      
      // Always close compose window first
      setShowCompose(false);
      
      // Show "Add Client" modal with pre-filled threading info
      const messageId = response?.data?.messageId || '';
      const subject = response?.data?.subject || composeData.subject || '';
      // Extract first email address (toEmail already contains trimmed value, but may have multiple emails)
      const firstEmail = toEmail.split(',')[0]?.trim() || '';
      
      if (messageId && firstEmail) {
        // Pre-fill the Add Client form with threading info
        setAddClientData({
          name: firstEmail.split('@')[0] || '', // Extract name from email
          email: firstEmail,
          country: '',
          conferenceId: '',
          threadRootMessageId: messageId,
          initialEmailSubject: subject
        });
        // Show modal after a brief delay to allow compose window to close smoothly
        setTimeout(() => {
          setShowAddClientModal(true);
        }, 300);
      } else {
        // No threading info available, just reset compose data
        resetComposeData();
      }
      
      refetch();
    } catch (error) {
      console.error('Send email error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Full error:', JSON.stringify(error.response?.data, null, 2));
      const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Failed to send email';
      toast.error(errorMessage);
    } finally {
      // Always clear sending state, even on error
      setIsSending(false);
    }
  };

  const handleCloseCompose = (closeType) => {
    if (hasComposeContent()) {
      setPendingCloseAction(closeType);
      setShowDraftConfirm(true);
    } else {
      // No content, close immediately
      setShowCompose(false);
      resetComposeData();
    }
  };

  const handleConfirmDiscard = () => {
    setShowCompose(false);
    resetComposeData();
    setShowDraftConfirm(false);
    setPendingCloseAction(null);
  };

  const handleConfirmSaveDraft = () => {
    saveDraftMutation.mutate();
  };

  const handleCancelDraftConfirm = () => {
    setShowDraftConfirm(false);
    setPendingCloseAction(null);
  };

  // Quill editor modules configuration - Memoized to prevent re-initialization
  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        [{ font: ['arial', 'calistomt', 'cambria', 'couriernew', 'georgia', 'helvetica', 'lucidasansunicode', 'palatinolinotype', 'tahoma', 'timesnewroman', 'trebuchetms', 'verdana'] }],
        [{ size: ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ 'line-spacing': ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0'] }],
        [{ 'paragraph-spacing': ['0', '0.5em', '1em', '1.5em', '2em', '2.5em', '3em'] }],
        [{ list: 'ordered'}, { list: 'bullet' }],
        [{ align: [] }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: {
        'line-spacing': function(value) {
          const quill = this.quill;
          const selection = quill.getSelection(true);
          if (!selection) return;
          
          // Preserve selection to restore it after formatting
          const savedSelection = { index: selection.index, length: selection.length };
          
          // Get all blocks in the selection to apply line-height to all paragraphs
          const [startLine] = quill.getLine(selection.index);
          const [endLine] = quill.getLine(selection.index + selection.length);
          
          if (startLine && endLine) {
            const startIndex = quill.getIndex(startLine);
            const endIndex = quill.getIndex(endLine);
            
            // Apply to all paragraphs in selection
            for (let i = startIndex; i <= endIndex; i++) {
              const [line] = quill.getLine(i);
              if (line) {
                const lineIdx = quill.getIndex(line);
                const currentFormat = quill.getFormat(line);
                const currentLineHeight = currentFormat['line-height'] || '1.15';
                
                if (value === currentLineHeight) {
                  quill.formatLine(lineIdx, 'line-height', false, 'user');
                } else {
                  quill.formatLine(lineIdx, 'line-height', value, 'user');
                }
              }
            }
          } else if (startLine) {
            // Single paragraph
            const lineIndex = quill.getIndex(startLine);
            const currentFormat = quill.getFormat(startLine);
            const currentLineHeight = currentFormat['line-height'] || '1.15';
            
            if (value === currentLineHeight) {
              quill.formatLine(lineIndex, 'line-height', false, 'user');
            } else {
              quill.formatLine(lineIndex, 'line-height', value, 'user');
            }
          }
          
          // Restore selection
          setTimeout(() => {
            quill.setSelection(savedSelection.index, savedSelection.length, 'user');
          }, 0);
        },
        'paragraph-spacing': function(value) {
          const quill = this.quill;
          const selection = quill.getSelection(true);
          if (!selection) return;
          
          // Preserve selection to restore it after formatting
          const savedSelection = { index: selection.index, length: selection.length };
          
          // Get all blocks in the selection to apply margin-bottom to all paragraphs
          const [startLine] = quill.getLine(selection.index);
          const [endLine] = quill.getLine(selection.index + selection.length);
          
          if (startLine && endLine) {
            const startIndex = quill.getIndex(startLine);
            const endIndex = quill.getIndex(endLine);
            
            // Apply to all paragraphs in selection
            for (let i = startIndex; i <= endIndex; i++) {
              const [line] = quill.getLine(i);
              if (line) {
                const lineIdx = quill.getIndex(line);
                const currentFormat = quill.getFormat(line);
                const currentMargin = currentFormat['margin-bottom'] || '0';
                
                if (value === currentMargin) {
                  quill.formatLine(lineIdx, 'margin-bottom', false, 'user');
                } else {
                  quill.formatLine(lineIdx, 'margin-bottom', value, 'user');
                }
              }
            }
          } else if (startLine) {
            // Single paragraph
            const lineIndex = quill.getIndex(startLine);
            const currentFormat = quill.getFormat(startLine);
            const currentMargin = currentFormat['margin-bottom'] || '0';
            
            if (value === currentMargin) {
              quill.formatLine(lineIndex, 'margin-bottom', false, 'user');
            } else {
              quill.formatLine(lineIndex, 'margin-bottom', value, 'user');
            }
          }
          
          // Restore selection
          setTimeout(() => {
            quill.setSelection(savedSelection.index, savedSelection.length, 'user');
          }, 0);
        }
      }
    },
    keyboard: {
      bindings: {
        // Override Enter key to create paragraph with spacing (like Word)
        enter: {
          key: 'Enter',
          handler: function(range, context) {
            const quill = this.quill;
            
            // Get current block format BEFORE Enter is processed
            const [currentLine] = quill.getLine(range.index);
            if (!currentLine) return true;
            
            // Get format from the DOM element directly to avoid Quill's format changes
            const currentLineElement = currentLine.domNode || currentLine;
            const currentStyle = currentLineElement.getAttribute('style') || '';
            
            // Get current block format once for efficiency
            const currentBlockFormat = quill.getFormat(currentLine);
            
            // Extract line-height from inline styles (preserve for consistent line spacing)
            let lineHeight = '1.15';
            
            if (currentStyle) {
              const lineHeightMatch = currentStyle.match(/line-height:\s*([^;]+)/i);
              if (lineHeightMatch) {
                lineHeight = lineHeightMatch[1].trim();
              }
            }
            
            // Also try to get from Quill format as fallback
            if (!lineHeight || lineHeight === '') {
              lineHeight = currentBlockFormat['line-height'] || '1.15';
            }
            
            // CRITICAL FIX: Only preserve paragraph spacing if it was explicitly set by user
            // Default to '0' for new paragraphs to prevent spacing accumulation
            // This ensures consistent line spacing unless user explicitly wants paragraph spacing
            let paragraphSpacing = '0'; // Default: no paragraph spacing for consistent line spacing
            const currentMargin = currentBlockFormat['margin-bottom'];
            
            // Only preserve paragraph spacing if it was explicitly set (not default/empty)
            // This prevents copying accumulated spacing to new lines
            if (currentMargin && currentMargin !== '0' && currentMargin !== '') {
              // User has explicitly set paragraph spacing, preserve it
              paragraphSpacing = currentMargin;
            } else {
              // Check inline styles as fallback
              if (currentStyle) {
                const marginMatch = currentStyle.match(/margin-bottom:\s*([^;]+)/i);
                if (marginMatch) {
                  const marginValue = marginMatch[1].trim();
                  // Only use if it's not zero/empty (user explicitly set it)
                  if (marginValue && marginValue !== '0' && marginValue !== '0px') {
                    paragraphSpacing = marginValue;
                  }
                }
              }
            }
            
            // Let Quill handle the default Enter behavior (creates new paragraph)
            // We'll apply formatting after the new paragraph is created, preserving cursor position
            let applied = false;
            
            const applyFormatting = () => {
              if (applied) return;
              
              // Get the current selection - this should be at the new paragraph after Enter
              const currentSelection = quill.getSelection(true);
              if (!currentSelection) {
                return;
              }
              
              // CRITICAL: Save the cursor position before any formatting operations
              const savedCursorIndex = currentSelection.index;
              const savedCursorLength = currentSelection.length;
              
              // Find the new line that was just created
              const [newLine] = quill.getLine(savedCursorIndex);
              if (newLine) {
                const lineIndex = quill.getIndex(newLine);
                
                // Apply line-height for consistent line spacing within paragraphs
                quill.formatLine(lineIndex, 'line-height', lineHeight, 'api');
                
                // Apply paragraph spacing: use '0' by default for consistent spacing
                // Only apply non-zero spacing if user explicitly set it
                if (paragraphSpacing && paragraphSpacing !== '0' && paragraphSpacing !== '0px') {
                  quill.formatLine(lineIndex, 'margin-bottom', paragraphSpacing, 'api');
                } else {
                  // Explicitly set to '0' to ensure no paragraph spacing (consistent line spacing)
                  quill.formatLine(lineIndex, 'margin-bottom', '0', 'api');
                }
                
                // CRITICAL: Restore cursor position immediately after formatting
                // Formatting with 'api' shouldn't move cursor, but we restore to be safe
                requestAnimationFrame(() => {
                  const checkSelection = quill.getSelection(true);
                  // Only restore if cursor position changed
                  if (!checkSelection || checkSelection.index !== savedCursorIndex) {
                    quill.setSelection(savedCursorIndex, savedCursorLength, 'user');
                  }
                });
                
                applied = true;
              }
            };
            
            // Only listen for text-change event (NOT selection-change, as it can cause cursor jumps)
            // The text-change event fires after Enter creates the new paragraph
            quill.once('text-change', (delta, oldDelta, source) => {
              // Only process user-initiated changes (Enter key press)
              if (source === 'user') {
                // Use setTimeout to ensure the new paragraph is fully created
                setTimeout(applyFormatting, 0);
              }
            });
            
            // Fallback timeout in case text-change doesn't fire
            setTimeout(() => {
              if (!applied) {
                applyFormatting();
              }
            }, 100);
            
            return true; // Allow default Enter behavior
          }
        },
        // Shift+Enter creates line break without paragraph spacing (like Word)
        'shift enter': {
          key: 'Enter',
          shiftKey: true,
          handler: function(range, context) {
            const quill = this.quill;
            
            // Get current paragraph's line-height to preserve it
            const [currentLine] = quill.getLine(range.index);
            if (currentLine) {
              const currentBlockFormat = quill.getFormat(currentLine);
              const lineHeight = currentBlockFormat['line-height'] || '1.15';
              
              // After line break is created, ensure line-height is preserved
              const handler = () => {
                const newRange = quill.getSelection(true);
                if (newRange) {
                  // Line break stays in same paragraph, so apply line-height to current paragraph
                  const [line] = quill.getLine(newRange.index);
                  if (line) {
                    const lineIndex = quill.getIndex(line);
                    quill.formatLine(lineIndex, 'line-height', lineHeight, 'user');
                  }
                }
                quill.off('text-change', handler);
              };
              
              quill.once('text-change', handler);
            }
            
            // Quill's default Shift+Enter behavior creates a line break (<br>)
            // This stays within the same paragraph, so no paragraph spacing is added
            return true; // Allow default behavior
          }
        },
        // Fix Backspace key to prevent cursor jumping to first line
        backspace: {
          key: 'Backspace',
          handler: function(range, context) {
            const quill = this.quill;
            
            // Save current cursor position before Backspace is processed
            const savedIndex = range.index;
            const savedLength = range.length;
            
            // Check if we're at the very beginning of the document with no content
            if (savedIndex === 0 && savedLength === 0) {
              const totalLength = quill.getLength();
              if (totalLength <= 1) {
                // Empty or only placeholder, allow default behavior
                return true;
              }
            }
            
            // Let Quill handle the default Backspace behavior first
            // Then ensure cursor position is preserved after deletion
            let cursorPreserved = false;
            
            const preserveCursor = () => {
              if (cursorPreserved) return;
              
              const currentSelection = quill.getSelection(true);
              if (!currentSelection) {
                // Selection was lost, restore based on expected position
                // Backspace deletes content, so cursor should move back
                const expectedIndex = Math.max(0, savedIndex - 1);
                quill.setSelection(expectedIndex, 0, 'user');
                cursorPreserved = true;
                return;
              }
              
              // Check if cursor unexpectedly jumped to beginning
              // This happens when ReactQuill re-renders and resets cursor
              if (currentSelection.index === 0 && savedIndex > 1) {
                // Cursor jumped to beginning - restore to expected position
                const expectedIndex = Math.max(0, savedIndex - 1);
                quill.setSelection(expectedIndex, 0, 'user');
                cursorPreserved = true;
              } else {
                // Cursor is in a reasonable position, but verify it's not too far off
                const expectedIndex = Math.max(0, savedIndex - 1);
                const diff = Math.abs(currentSelection.index - expectedIndex);
                // If cursor is more than 10 positions off, it likely jumped
                if (diff > 10 && savedIndex > 10) {
                  quill.setSelection(expectedIndex, 0, 'user');
                  cursorPreserved = true;
                }
              }
            };
            
            // Listen for text-change event to restore cursor after deletion
            quill.once('text-change', (delta, oldDelta, source) => {
              if (source === 'user') {
                // Check if this is actually a deletion (Backspace operation)
                const isDeletion = delta.ops.some(op => op.delete && op.delete > 0);
                if (isDeletion) {
                  // Use multiple timing methods to ensure cursor is restored
                  // This handles cases where ReactQuill re-renders and resets cursor
                  setTimeout(preserveCursor, 0);
                  requestAnimationFrame(preserveCursor);
                  // Also try after a slightly longer delay to catch delayed updates
                  setTimeout(preserveCursor, 10);
                  // Final check after React state updates complete
                  setTimeout(preserveCursor, 50);
                }
              }
            });
            
            // Allow default Backspace behavior
            return true;
          }
        }
      }
    },
    clipboard: {
      // Preserve line breaks and formatting when pasting
      matchVisual: false,
      // Don't normalize HTML - preserve original formatting and spacing
      preserveWhitespace: true
    }
  }), []); // Empty dependency array - modules never change

  const quillFormats = [
    'header',
    'font',
    'size',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'line-height',
    'margin-bottom',
    'list',
    'bullet',
    'align',
    'link',
    'image',
    'blockquote',
    'code-block',
    'indent',
    'preserved-html' // Our custom Blot for preserving HTML structure
  ];


  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (hours < 168) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getInitials = (email) => {
    if (!email) return '?';
    const parts = email.split('@')[0].split('.');
    return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2) || '?';
  };

  // Helper function to check if email has attachments
  const hasAttachments = (email) => {
    if (email.hasAttachments === true) return true;
    if (!email.attachments) return false;
    
    // Handle array
    if (Array.isArray(email.attachments)) {
      return email.attachments.length > 0;
    }
    
    // Handle string (JSON stringified)
    if (typeof email.attachments === 'string') {
      const trimmed = email.attachments.trim();
      if (trimmed === '' || trimmed === '[]' || trimmed === 'null') return false;
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.length > 0 : !!parsed;
      } catch {
        return trimmed.length > 0;
      }
    }
    
    // Handle object
    return !!email.attachments;
  };

  const folders = [
    { id: 'inbox', icon: Inbox, label: 'Inbox', count: activeFolder === 'inbox' ? emails.length : 0 },
    { id: 'sent', icon: Send, label: 'Sent', count: activeFolder === 'sent' ? emails.length : 0 },
    { id: 'all', icon: Mail, label: 'All Mail', count: activeFolder === 'all' ? emails.length : 0 },
    { id: 'spam', icon: AlertCircle, label: 'Spam', count: activeFolder === 'spam' ? emails.length : 0 },
    { id: 'drafts', icon: File, label: 'Drafts', count: activeFolder === 'drafts' ? emails.length : 0 },
    { id: 'trash', icon: Trash2, label: 'Trash', count: 0 }
  ];

  // Enterprise-level onChange handler - matches Templates.js pattern exactly
  const handleBodyChange = useCallback((html) => {
    // Simple direct update - ReactQuill handles focus internally
    // This matches the working pattern in Templates.js
    try {
      const htmlValue = html || '';
      setComposeData(prev => ({
        ...prev,
        body: htmlValue
      }));
      
      // CRITICAL: Force toolbar visible on every change - use multiple methods
      const toolbar = document.querySelector('.compose-editor .ql-toolbar');
      if (toolbar) {
        // Method 1: cssText (most aggressive)
        toolbar.style.cssText = `
          display: flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          height: auto !important;
          min-height: 42px !important;
          max-height: none !important;
          overflow: visible !important;
          position: relative !important;
          z-index: 10 !important;
        `;
        
        // Method 2: Remove hiding classes
        toolbar.classList.remove('ql-hidden', 'hidden', 'invisible', 'd-none');
        toolbar.classList.add('ql-snow');
        
        // Method 3: Force children visible (but respect dropdown expanded state)
        const children = toolbar.querySelectorAll('button, .ql-picker, .ql-formats, .ql-picker-label, span');
        children.forEach(child => {
          // Skip picker options - they should be controlled by .ql-expanded class
          if (child.classList && child.classList.contains('ql-picker-options')) {
            return;
          }
          if (child.style && !child.closest('.ql-picker-options')) {
            const computed = window.getComputedStyle(child);
            if (computed.display === 'none' || computed.visibility === 'hidden') {
              child.style.cssText = `
                display: inline-block !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
              `;
            }
          }
        });
        
        // Ensure dropdowns respect their expanded state
        const pickerOptions = toolbar.querySelectorAll('.ql-picker-options');
        pickerOptions.forEach(options => {
          const picker = options.closest('.ql-picker');
          if (picker) {
            if (picker.classList.contains('ql-expanded')) {
              // If expanded, ensure visible
              const computed = window.getComputedStyle(options);
              if (computed.display === 'none' || computed.visibility === 'hidden') {
                options.style.cssText = `
                  display: block !important;
                  visibility: visible !important;
                  opacity: 1 !important;
                  pointer-events: auto !important;
                `;
              }
            } else {
              // If not expanded, ensure hidden
              options.style.cssText = `
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              `;
            }
          }
        });
      }
    } catch (error) {
      // Silently handle any errors to prevent editor from breaking
      console.warn('Error in handleBodyChange:', error);
    }
  }, []); // Stable function reference

  const openComposeWindow = (preferredAccountId = null) => {
    try {
      if (preferredAccountId && preferredAccountId !== 'all' && visibleEmailAccounts.some(acc => acc.id === preferredAccountId)) {
        setSelectedEmailAccountId(preferredAccountId);
      } else if (!selectedEmailAccountId && visibleEmailAccounts.length) {
        setSelectedEmailAccountId(visibleEmailAccounts[0].id);
      }
      setShowCompose(true);
      setIsComposeMaximized(false);
    } catch (error) {
      console.error('Error in openComposeWindow:', error);
      // Force open the window even if there's an error
      setShowCompose(true);
    }
  };

  const startNewCompose = () => {
    try {
      console.log('Compose button clicked');
      resetComposeData();
      const preferredAccount = activeEmailAccountId !== 'all' ? activeEmailAccountId : null;
      openComposeWindow(preferredAccount);
      setSelectedEmail(null);
    } catch (error) {
      console.error('Error opening compose window:', error);
      // Still try to open the window even if there's an error
      setShowCompose(true);
    }
  };

  const pagination = emailsData?.pagination || { total: 0, page: 1, pages: 0, hasMore: false };

  // Helper: convert plain text to basic HTML while preserving line breaks/spaces
  const convertTextToHtml = (text = '') => {
    if (!text) return '';
    // Escape basic HTML characters
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .split('\n')
      .map(line => (line.trim().length === 0 ? '&nbsp;' : line))
      .join('<br />');
  };

  const handleReply = () => {
    if (!selectedEmail) return;

    // Prefer the exact HTML we received so layout is preserved.
    let originalHtml = selectedEmail.bodyHtml;

    // If we don't have HTML, fall back to converting text into basic HTML with line breaks.
    if (!originalHtml) {
      if (selectedEmail.body && selectedEmail.body.includes('<')) {
        originalHtml = selectedEmail.body;
      } else {
        originalHtml = convertTextToHtml(selectedEmail.bodyText || selectedEmail.body || '');
      }
    }

    // Wrap the original email in a div with contentEditable="false" to preserve structure
    // The custom PreservedHtmlBlot will handle this, but we still wrap for CSS styling
    const wrappedOriginalHtml = originalHtml 
      ? `<div class="preserved-email-content" data-quill-preserve="true" contenteditable="false" style="border-left: 3px solid #ccc; margin: 10px 0; padding: 10px 0 10px 15px; background-color: #f9f9f9; overflow-x: auto; width: 100%; box-sizing: border-box; display: block;">${originalHtml}</div>`
      : '';

    // Add a separator and the wrapped original email
    const fullHtml = `<p><br></p>${wrappedOriginalHtml}`;

    setComposeData({
      to: selectedEmail.from || '',
      cc: '',
      bcc: '',
      subject: selectedEmail.subject?.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject || ''}`,
      body: '', // Set empty initially
      attachments: []
    });
    
    // Store HTML to set after editor mounts using dangerouslyPasteHTML
    setPendingReplyHtml(fullHtml);
    openComposeWindow(selectedEmail.emailAccountId || activeEmailAccountId);
  };

  const handleForward = () => {
    if (!selectedEmail) return;

    let originalHtml = selectedEmail.bodyHtml;

    if (!originalHtml) {
      if (selectedEmail.body && selectedEmail.body.includes('<')) {
        originalHtml = selectedEmail.body;
      } else {
        originalHtml = convertTextToHtml(selectedEmail.bodyText || selectedEmail.body || '');
      }
    }

    // Wrap the original email in a div with contentEditable="false" to preserve structure
    // The custom PreservedHtmlBlot will handle this, but we still wrap for CSS styling
    const wrappedOriginalHtml = originalHtml 
      ? `<div class="preserved-email-content" data-quill-preserve="true" contenteditable="false" style="border-left: 3px solid #ccc; margin: 10px 0; padding: 10px 0 10px 15px; background-color: #f9f9f9; overflow-x: auto; width: 100%; box-sizing: border-box; display: block;">${originalHtml}</div>`
      : '';

    // Add a separator and the wrapped original email
    const fullHtml = `<p><br></p>${wrappedOriginalHtml}`;

    setComposeData({
      to: '',
      cc: '',
      bcc: '',
      subject: selectedEmail.subject?.startsWith('Fwd:') ? selectedEmail.subject : `Fwd: ${selectedEmail.subject || ''}`,
      body: '', // Set empty initially
      attachments: []
    });
    
    // Store HTML to set after editor mounts using dangerouslyPasteHTML
    setPendingReplyHtml(fullHtml);
    openComposeWindow(selectedEmail.emailAccountId || activeEmailAccountId);
  };

  const handleEditDraft = (draftEmail) => {
    if (!draftEmail) return;
    
    // Parse attachments if they exist
    let draftAttachments = [];
    if (draftEmail.attachments) {
      try {
        if (Array.isArray(draftEmail.attachments)) {
          draftAttachments = draftEmail.attachments;
        } else if (typeof draftEmail.attachments === 'string') {
          draftAttachments = JSON.parse(draftEmail.attachments);
        }
      } catch (e) {
        console.error('Error parsing draft attachments:', e);
        draftAttachments = [];
      }
    }

    // Pre-populate compose data with draft content
    setComposeData({
      to: draftEmail.to || '',
      cc: draftEmail.cc || '',
      bcc: draftEmail.bcc || '',
      subject: draftEmail.subject || '',
      body: draftEmail.bodyHtml || draftEmail.body || '',
      attachments: []
    });
    
    // Note: We can't restore File objects from saved attachments (they're base64 in DB)
    // So we only restore the metadata. Users would need to re-attach files if needed.
    // For now, we'll just set the attachmentFiles to empty array
    setAttachmentFiles([]);
    
    // Track which draft we're editing
    setEditingDraftId(draftEmail.id);
    
    // Open compose modal
    openComposeWindow(draftEmail.emailAccountId || activeEmailAccountId);
    setSelectedEmail(null); // Close email view
  };

  const handleStar = () => {
    if (!selectedEmail) return;
    starEmailMutation.mutate(selectedEmail.id);
  };

  const handleArchive = () => {
    if (!selectedEmail) return;
    if (window.confirm('Archive this email?')) {
      archiveEmailMutation.mutate(selectedEmail.id);
    }
  };

  const handleDelete = () => {
    if (!selectedEmail) return;
    if (window.confirm('Move this email to trash?')) {
      deleteEmailMutation.mutate(selectedEmail.id);
    }
  };

  const handleDeleteDraft = (draftId) => {
    if (!draftId) {
      draftId = selectedEmail?.id || editingDraftId;
    }
    if (!draftId) return;
    
    if (window.confirm('Are you sure you want to permanently delete this draft? This action cannot be undone.')) {
      deleteDraftMutation.mutate(draftId);
    }
  };

  const handleFolderChange = (folderId) => {
    setActiveFolder(folderId);
    setCurrentPage(1);
    setSelectedEmail(null); // Clear selected email to show folder list
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    setSelectedEmail(null);
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    setFilters({
      fromEmail: '',
      toEmail: '',
      startDate: '',
      endDate: ''
    });
    setCurrentPage(1);
  };

  const filteredEmails = emails;

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-none border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-4">
            <Mail className="h-6 w-6 text-red-600" />
            <h1 className="text-xl font-normal text-gray-900">Mail</h1>
          </div>
          
          <div className="flex-1 max-w-2xl mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search mail"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-0 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isConnected && (
              <div className="flex items-center text-xs text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                <span>Connected</span>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 flex-none border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4">
            <button
              onClick={startNewCompose}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-md"
            >
              <Pencil className="h-5 w-5" />
              <span className="font-medium">Compose</span>
            </button>
          </div>

          <div className="px-4 pb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              SMTP Accounts
            </h4>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveEmailAccountId('all');
                  ensureEditorActive();
                }}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  activeEmailAccountId === 'all'
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                All Accounts
              </button>
              {[
                { key: 'shared', label: 'Shared (System)', accounts: groupedEmailAccounts.shared },
                { key: 'mine', label: 'My Accounts', accounts: groupedEmailAccounts.mine },
                ...(isCeo ? [{ key: 'others', label: 'Team Accounts', accounts: groupedEmailAccounts.others }] : [])
              ].map((section) =>
                section.accounts.length > 0 ? (
                  <div key={section.key} className="mt-3">
                    <p className="text-[11px] font-semibold uppercase text-gray-400 mb-1">{section.label}</p>
                    <div className="space-y-1">
                      {section.accounts.map((account) => {
                        const isSelected = activeEmailAccountId === account.id;
                        const badge =
                          account.sendPriority === 1
                            ? 'Primary'
                            : account.sendPriority === 2
                              ? 'Secondary'
                              : `#${account.sendPriority}`;
                        return (
                          <button
                            key={account.id}
                            onClick={() => {
                              setActiveEmailAccountId(account.id);
                            }}
                            className={`w-full px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-100 text-blue-800 font-medium'
                                : 'text-gray-700 hover:bg-gray-100'
                            } ${account.isActive ? '' : 'opacity-60'}`}
                          >
                            <span className="truncate">{account.name || account.email}</span>
                            <span className="ml-2 text-xs text-gray-500">{badge}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>

          <nav className="px-2 space-y-1">
            {folders.map((folder) => {
              const Icon = folder.icon;
              const isActive = activeFolder === folder.id;
              return (
                <button
                  key={folder.id}
                  onClick={() => handleFolderChange(folder.id)}
                  className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-r-full transition-colors ${
                    isActive 
                      ? 'bg-red-100 text-red-900 font-medium' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`h-5 w-5 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
                    <span>{folder.label}</span>
                  </div>
                  {folder.count > 0 && (
                    <span className="text-xs text-gray-500">{folder.count}</span>
                  )}
                </button>
              );
            })}
          </nav>
          
          <div className="px-4 py-3 border-t border-gray-200 mt-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-2"
            >
              <Search className="h-4 w-4" />
              <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {!selectedEmail ? (
            // Email List View - Full Width
            <div className="flex-1 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
            
            {showFilters && (
              <div className="flex-none border-b border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="From email..."
                    value={filters.fromEmail}
                    onChange={(e) => setFilters({...filters, fromEmail: e.target.value})}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md"
                  />
                  <input
                    type="text"
                    placeholder="To email..."
                    value={filters.toEmail}
                    onChange={(e) => setFilters({...filters, toEmail: e.target.value})}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md"
                  />
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Email Date From</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-md w-full"
                  />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Email Date To</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-md w-full"
                  />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleApplyFilters}
                    className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Apply Filters
                  </button>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Inbox className="h-12 w-12 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {activeFolder === 'inbox' ? 'Your inbox is empty' : `No ${activeFolder} emails`}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {activeFolder === 'inbox' 
                    ? 'When emails arrive, they\'ll appear here' 
                    : `You don't have any ${activeFolder} emails yet`}
                </p>
                <button
                  onClick={handleSync}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Sync Emails</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredEmails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => {
                      // If it's a draft, open it in compose mode for editing
                      if (email.isDraft || email.status === 'draft') {
                        handleEditDraft(email);
                      } else {
                      console.log('Selected email:', email);
                      console.log('Email body:', email.body);
                      console.log('Email bodyText:', email.bodyText);
                      setSelectedEmail(email);
                      // Mark as read if not already read
                      if (!email.isRead) {
                        markAsReadMutation.mutate(email.id);
                      }
                      }
                    }}
                    className={`flex items-start space-x-3 px-4 py-3 cursor-pointer hover:shadow-sm transition-all group ${
                      selectedEmail?.id === email.id 
                        ? 'bg-blue-50 border-l-4 border-blue-600' 
                        : !email.isRead 
                          ? 'bg-white border-l-4 border-transparent' 
                          : 'bg-gray-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className={`flex-none w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                      !email.isRead ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-700'
                    }`}>
                      {getInitials(activeFolder === 'sent' ? (email.to || '') : (email.from || ''))}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'}`}>
                          {activeFolder === 'sent' 
                            ? (email.to?.split('<')[0].trim() || email.to || 'No recipient')
                            : (email.from?.split('<')[0].trim() || email.from || 'Unknown sender')}
                        </span>
                        <span className="text-xs text-gray-500 flex-none ml-2">
                          {formatDate(email.date)}
                        </span>
                      </div>
                      
                      <div className={`text-sm mb-1 truncate ${!email.isRead ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      <div className="flex items-center space-x-2">
                        <span>{email.subject || '(no subject)'}</span>
                        {hasAttachments(email) && (
                          <Paperclip className="h-3.5 w-3.5 text-gray-500 flex-none" title="Has attachments" />
                        )}
                      </div>
                      </div>
                      
                      <div className="text-xs text-gray-500 truncate">
                        {email.bodyText?.substring(0, 100) || 'No preview available'}
                      </div>
                    </div>

                  {/* Quick delete button for drafts - appears on hover */}
                  {(email.isDraft || email.status === 'draft') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent opening the draft
                        handleDeleteDraft(email.id);
                      }}
                      className="flex-none opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete draft permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
            
            {pagination.pages > 1 && (
              <div className="flex-none border-t border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= pagination.pages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          ) : (
            // Email Detail View - Full Page
            <div className="flex-1 bg-white overflow-y-auto">
              <div className="border-b border-gray-200 p-6">
                <div className="flex items-center space-x-4 mb-4">
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    title="Back to inbox"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <h2 className="text-2xl font-normal text-gray-900 flex-1">
                    {selectedEmail.subject || '(no subject)'}
                  </h2>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                    {getInitials(selectedEmail.from || 'Unknown')}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {selectedEmail.from?.split('<')[0].trim() || selectedEmail.from || 'Unknown Sender'}
                    </div>
                    <div className="text-xs text-gray-500">
                      to {selectedEmail.to || 'Unknown Recipient'}
                    </div>
                    {selectedEmail.messageId && (
                      <div className="text-xs text-gray-400 mt-1">
                        <span className="font-mono">Message ID: </span>
                        <span 
                          className="font-mono cursor-pointer hover:text-gray-600 hover:underline"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedEmail.messageId);
                            toast.success('Message ID copied to clipboard');
                          }}
                          title="Click to copy Message ID"
                        >
                          {selectedEmail.messageId}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : 'Unknown Date'}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Show Edit button for drafts */}
                  {(selectedEmail?.isDraft || selectedEmail?.status === 'draft') ? (
                    <button 
                      onClick={() => handleEditDraft(selectedEmail)}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      <span>Edit Draft</span>
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={handleReply}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                    <Reply className="h-4 w-4" />
                    <span>Reply</span>
                  </button>
                      <button 
                        onClick={handleForward}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                    <Forward className="h-4 w-4" />
                    <span>Forward</span>
                  </button>
                    </>
                  )}
                  <button 
                    onClick={handleStar}
                    className={`flex items-center space-x-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      selectedEmail?.isStarred 
                        ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${selectedEmail?.isStarred ? 'fill-current' : ''}`} />
                    <span>Star</span>
                  </button>
                  <button 
                    onClick={handleArchive}
                    className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Archive className="h-4 w-4" />
                    <span>Archive</span>
                  </button>
                  {/* Show Delete Draft for drafts, regular Delete for other emails */}
                  {(selectedEmail?.isDraft || selectedEmail?.status === 'draft') ? (
                    <button 
                      onClick={() => handleDeleteDraft(selectedEmail.id)}
                      disabled={deleteDraftMutation.isLoading}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{deleteDraftMutation.isLoading ? 'Deleting...' : 'Delete Draft'}</span>
                    </button>
                  ) : (
                    <button 
                      onClick={handleDelete}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6">
                {(() => {
                  const emailBody = selectedEmail.bodyHtml || selectedEmail.body || selectedEmail.bodyText;
                  console.log('Rendering email body:', emailBody ? 'Has content' : 'No content');
                  
                  if (emailBody) {
                    return (
                      <div 
                        className="prose prose-sm max-w-none text-gray-900"
                        dangerouslySetInnerHTML={{ __html: emailBody }}
                        style={{ 
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          fontSize: '14px',
                          lineHeight: '1.6'
                        }}
                      />
                    );
                  } else {
                    return (
                      <div className="text-center py-12 text-gray-500">
                        <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>This email has no content</p>
                      </div>
                    );
                  }
                })()}
                
                {(() => {
                  try {
                    const attachments = Array.isArray(selectedEmail.attachments) 
                      ? selectedEmail.attachments 
                      : (typeof selectedEmail.attachments === 'string' ? JSON.parse(selectedEmail.attachments) : []);
                    
                    if (attachments && attachments.length > 0) {
                      const handleDownloadAttachment = async (attachment, index) => {
                        try {
                          const url = `/api/emails/${selectedEmail.id}/attachments/${index}`;
                          const response = await axios.get(url, {
                            responseType: 'blob',
                            headers: {
                              'Authorization': `Bearer ${localStorage.getItem('token')}`
                            }
                          });
                          
                          const blob = new Blob([response.data]);
                          const downloadUrl = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = downloadUrl;
                          link.download = attachment.filename || attachment.name || `attachment-${index + 1}`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(downloadUrl);
                          toast.success('Attachment downloaded successfully');
                        } catch (error) {
                          console.error('Download error:', error);
                          toast.error('Failed to download attachment');
                        }
                      };

                      const isImageFile = (filename, contentType) => {
                        if (!filename && !contentType) return false;
                        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
                        const lowerFilename = (filename || '').toLowerCase();
                        const isImageExt = imageExtensions.some(ext => lowerFilename.endsWith(ext));
                        const isImageContentType = contentType && contentType.startsWith('image/');
                        return isImageExt || isImageContentType;
                      };

                      return (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                          <h3 className="text-sm font-medium text-gray-900 mb-3">
                            Attachments ({attachments.length})
                          </h3>
                          <div className="space-y-3">
                            {attachments.map((attachment, index) => {
                              const filename = attachment.filename || attachment.name || `Attachment ${index + 1}`;
                              const contentType = attachment.contentType || attachment.mimetype || '';
                              const isImage = isImageFile(filename, contentType);
                              const attachmentViewUrl = `/api/emails/${selectedEmail.id}/attachments/${index}/view`;
                              
                              return (
                                <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                                  {/* Image Preview */}
                                  {isImage && (
                                    <div className="bg-gray-50 p-3 border-b border-gray-200">
                                      <img 
                                        src={attachmentViewUrl}
                                        alt={filename}
                                        className="max-w-full max-h-64 mx-auto rounded cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={async () => {
                                          try {
                                            const response = await axios.get(attachmentViewUrl, {
                                              responseType: 'blob',
                                              headers: {
                                                'Authorization': `Bearer ${localStorage.getItem('token')}`
                                              }
                                            });
                                            const blob = new Blob([response.data]);
                                            const url = window.URL.createObjectURL(blob);
                                            window.open(url, '_blank');
                                          } catch (error) {
                                            console.error('Error viewing image:', error);
                                            toast.error('Failed to view image');
                                          }
                                        }}
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                  
                                  {/* Attachment Info and Actions */}
                                  <div className="flex items-center justify-between p-3 bg-white">
                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                      {!isImage && (
                                        <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate" title={filename}>
                                          {filename}
                                        </p>
                                        {attachment.size && (
                                          <p className="text-xs text-gray-500">
                                            {Math.round(attachment.size / 1024)} KB
                                            {contentType && ` • ${contentType.split('/')[1]?.toUpperCase() || contentType}`}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                                      {isImage && (
                                        <button
                                          onClick={async () => {
                                            try {
                                              const response = await axios.get(attachmentViewUrl, {
                                                responseType: 'blob',
                                                headers: {
                                                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                                                }
                                              });
                                              const blob = new Blob([response.data]);
                                              const url = window.URL.createObjectURL(blob);
                                              window.open(url, '_blank');
                                            } catch (error) {
                                              console.error('Error viewing image:', error);
                                              toast.error('Failed to view image');
                                            }
                                          }}
                                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                          title="View image in new tab"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDownloadAttachment(attachment, index)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                        title="Download attachment"
                                      >
                                        <Download className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  } catch (e) {
                    console.error('Error parsing attachments:', e);
                    return null;
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gmail-style Compose Window */}
      {showCompose && (
        <div
          className={`fixed ${
            isComposeMaximized
              ? 'top-20 left-[280px] right-8 bottom-8'
              : 'bottom-4 right-4 w-[600px] h-[600px] max-h-[calc(100vh-2rem)]'
        } z-50 bg-white shadow-2xl rounded-lg border border-gray-300 flex flex-col transition-all duration-300`}
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={(e) => {
            // Prevent clicks inside compose window from closing it
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            // Prevent any mouse down events from bubbling
            e.stopPropagation();
            // Only handle if clicking on the compose window itself, not child elements
            if (e.target === e.currentTarget) {
              // Focus the editor when clicking the compose window background
              const editorElement = document.querySelector('.compose-editor .ql-editor');
              if (editorElement) {
                try {
                  editorElement.focus();
                } catch (e) {
                  // Ignore focus errors
                }
              }
            }
          }}
        >
          {/* Header */}
          <div 
            className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200 rounded-t-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">
                {editingDraftId ? 'Edit Draft' : 'New Message'}
              </span>
              {editingDraftId && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                  Draft
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setIsComposeMaximized(!isComposeMaximized)}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title={isComposeMaximized ? 'Restore' : 'Maximize'}
              >
                {isComposeMaximized ? <Minimize2 className="h-4 w-4 text-gray-600" /> : <Maximize2 className="h-4 w-4 text-gray-600" />}
              </button>
                    <button
                onClick={() => handleCloseCompose('close')}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title="Close"
                    >
                <X className="h-4 w-4 text-gray-600" />
                    </button>
            </div>
                  </div>

          {/* To, CC, BCC Fields */}
              <div 
                className="px-4 py-2 border-b border-gray-200 space-y-2 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center">
                  <span className="text-xs text-gray-500 w-12 flex-shrink-0">From</span>
                  {emailAccountsLoading ? (
                    <span className="text-xs text-gray-500 ml-2">Loading accounts...</span>
                  ) : !visibleEmailAccounts.length ? (
                    <span className="text-xs text-red-500 ml-2">
                      {isCeo 
                        ? 'No SMTP accounts available' 
                        : 'No SMTP accounts assigned to your conferences. Please contact your administrator.'}
                    </span>
                  ) : (
                  <select
                    value={selectedEmailAccountId || ''}
                    onChange={(e) => {
                      setSelectedEmailAccountId(e.target.value);
                      // Editor should remain stable - no need to re-initialize
                    }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {visibleEmailAccounts.length === 0 ? (
                      <option value="">No SMTP accounts available</option>
                    ) : (
                      <>
                        {/* Group accounts by category for better UX */}
                        {visibleEmailAccounts.filter(acc => acc.isSystemAccount).length > 0 && (
                          <optgroup label="Shared (System)">
                            {visibleEmailAccounts
                              .filter(acc => acc.isSystemAccount)
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name || account.email} ({account.email}){account.isActive === false ? ' (Paused)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}
                        {visibleEmailAccounts.filter(acc => !acc.isSystemAccount && acc.ownerId === currentUserId).length > 0 && (
                          <optgroup label="My Accounts">
                            {visibleEmailAccounts
                              .filter(acc => !acc.isSystemAccount && acc.ownerId === currentUserId)
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name || account.email} ({account.email}){account.isActive === false ? ' (Paused)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}
                        {isCeo && visibleEmailAccounts.filter(acc => !acc.isSystemAccount && acc.ownerId && acc.ownerId !== currentUserId).length > 0 && (
                          <optgroup label="Team Accounts">
                            {visibleEmailAccounts
                              .filter(acc => !acc.isSystemAccount && acc.ownerId && acc.ownerId !== currentUserId)
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name || account.email} ({account.email}){account.isActive === false ? ' (Paused)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}
                        {/* If no optgroups match, show all accounts directly */}
                        {visibleEmailAccounts.filter(acc => acc.isSystemAccount).length === 0 &&
                         visibleEmailAccounts.filter(acc => !acc.isSystemAccount && acc.ownerId === currentUserId).length === 0 &&
                         (!isCeo || visibleEmailAccounts.filter(acc => !acc.isSystemAccount && acc.ownerId && acc.ownerId !== currentUserId).length === 0) && (
                          <>
                            {visibleEmailAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name || account.email} ({account.email}){account.isActive === false ? ' (Paused)' : ''}
                              </option>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </select>
                  )}
                </div>
                <div className="relative">
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 w-12 flex-shrink-0">To</span>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Recipients"
                        value={composeData.to}
                        onChange={handleToInputChange}
                        onKeyDown={handleToInputKeyDown}
                        onFocus={() => {
                          if (suggestionInput && suggestionInput.length >= 2) {
                            setShowSuggestions(emailSuggestions.length > 0);
                          }
                        }}
                        onBlur={(e) => {
                          handleToInputBlur();
                        }}
                        className="w-full px-2 py-1 text-sm border-0 focus:ring-0 placeholder-gray-400"
                        autoComplete="off"
                      />
                      {showSuggestions && emailSuggestions.length > 0 && (
                        <div className="absolute z-[60] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                          {suggestionsLoading && (
                            <div className="px-4 py-2 text-sm text-gray-500">
                              Loading suggestions...
                            </div>
                          )}
                          {!suggestionsLoading && emailSuggestions.map((suggestion, index) => (
                            <div
                              key={index}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSuggestionSelect(suggestion);
                              }}
                              className={`px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors ${
                                index === activeSuggestionIndex ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                <Mail className="h-4 w-4 text-gray-400 flex-none" />
                                <div className="flex-1 min-w-0">
                                  {suggestion.name ? (
                                    <>
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                        {suggestion.name}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate">
                                        {suggestion.email}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-sm text-gray-900 truncate">
                                      {suggestion.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {showCC && (
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 w-12 flex-shrink-0">Cc</span>
                    <input
                      type="text"
                      placeholder="Cc"
                      value={composeData.cc}
                      onChange={(e) => setComposeData({ ...composeData, cc: e.target.value })}
                      className="flex-1 px-2 py-1 text-sm border-0 focus:ring-0 placeholder-gray-400"
                      autoComplete="off"
                    />
                  </div>
                )}

                {showBCC && (
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 w-12 flex-shrink-0">Bcc</span>
                    <input
                      type="text"
                      placeholder="Bcc"
                      value={composeData.bcc}
                      onChange={(e) => setComposeData({ ...composeData, bcc: e.target.value })}
                      className="flex-1 px-2 py-1 text-sm border-0 focus:ring-0 placeholder-gray-400"
                      autoComplete="off"
                      />
                  </div>
                )}

                {/* CC/BCC Toggle */}
                <div className="flex items-center space-x-4 pl-12">
                  <button
                    onClick={() => setShowCC(!showCC)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showCC ? 'Remove Cc' : 'Cc'}
                  </button>
                  <button
                    onClick={() => setShowBCC(!showBCC)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showBCC ? 'Remove Bcc' : 'Bcc'}
                  </button>
                </div>

                {/* Subject */}
            <div className="flex items-center pt-2 border-t border-gray-100">
                      <input
                        type="text"
                        placeholder="Subject"
                        value={composeData.subject}
                onChange={(e) => {
                  setComposeData({ ...composeData, subject: e.target.value });
                }}
                className="flex-1 px-2 py-1 text-sm border-0 focus:ring-0 placeholder-gray-400"
              />
            </div>
                    </div>

              {/* Rich Text Editor - Matching Templates.js structure exactly */}
              <div 
                className="flex-1 flex flex-col min-h-0"
                style={{ position: 'relative', zIndex: 1, overflow: 'hidden' }}
              >
                <div 
                  className="border border-gray-300 rounded-lg bg-white flex flex-col"
                  style={{ position: 'relative', zIndex: 1, flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}
                  onClick={(e) => {
                    // Ensure toolbar stays visible when clicking in editor area
                    requestAnimationFrame(() => {
                      const toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
                      if (toolbarElement) {
                        toolbarElement.style.setProperty('display', 'flex', 'important');
                        toolbarElement.style.setProperty('visibility', 'visible', 'important');
                        toolbarElement.style.setProperty('opacity', '1', 'important');
                        toolbarElement.style.setProperty('pointer-events', 'auto', 'important');
                      }
                    });
                  }}
                  onMouseDown={(e) => {
                    // Also ensure on mousedown
                    const toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
                    if (toolbarElement) {
                      toolbarElement.style.setProperty('display', 'flex', 'important');
                      toolbarElement.style.setProperty('visibility', 'visible', 'important');
                      toolbarElement.style.setProperty('opacity', '1', 'important');
                    }
                  }}
                >
                  <ReactQuill
                    key="compose-editor"
                    ref={quillEditorRef}
                    value={composeData.body || ''}
                    onChange={handleBodyChange}
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Compose your message..."
                    className="compose-editor"
                    theme="snow"
                    bounds="self"
                    preserveWhitespace={true}
                    onFocus={() => {
                      // Explicitly ensure toolbar is visible when editor gains focus
                      const ensureToolbarVisible = () => {
                        const toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
                        if (toolbarElement) {
                          toolbarElement.style.setProperty('display', 'flex', 'important');
                          toolbarElement.style.setProperty('visibility', 'visible', 'important');
                          toolbarElement.style.setProperty('opacity', '1', 'important');
                          toolbarElement.style.setProperty('pointer-events', 'auto', 'important');
                          toolbarElement.style.setProperty('height', 'auto', 'important');
                          toolbarElement.style.setProperty('min-height', '42px', 'important');
                        }
                      };
                      requestAnimationFrame(ensureToolbarVisible);
                      // Also ensure after a short delay to catch any delayed hiding
                      setTimeout(ensureToolbarVisible, 10);
                      setTimeout(ensureToolbarVisible, 50);
                    }}
                    onBlur={(previousRange, source, editor) => {
                      // NEVER hide toolbar on blur - keep it always visible
                      requestAnimationFrame(() => {
                        const toolbarElement = document.querySelector('.compose-editor .ql-toolbar');
                        if (toolbarElement) {
                          toolbarElement.style.setProperty('display', 'flex', 'important');
                          toolbarElement.style.setProperty('visibility', 'visible', 'important');
                          toolbarElement.style.setProperty('opacity', '1', 'important');
                          toolbarElement.style.setProperty('pointer-events', 'auto', 'important');
                        }
                      });
                    }}
                  />
                </div>
                <style>{`
                  .compose-editor {
                    display: flex !important;
                    flex-direction: column !important;
                    position: relative !important;
                    z-index: 1 !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                  }
                  /* CRITICAL: Toolbar MUST always be visible - maximum specificity and priority */
                  .compose-editor .ql-toolbar,
                  .compose-editor .ql-snow .ql-toolbar,
                  .compose-editor .ql-toolbar.ql-snow,
                  .compose-editor .ql-toolbar[style],
                  .compose-editor .ql-toolbar[style*="display"],
                  .compose-editor .ql-toolbar[style*="visibility"],
                  .compose-editor .ql-toolbar[style*="opacity"],
                  .compose-editor .ql-toolbar.hidden,
                  .compose-editor .ql-toolbar.ql-hidden,
                  .compose-editor .ql-toolbar.invisible,
                  .compose-editor .ql-toolbar.d-none,
                  .compose-editor .ql-snow .ql-toolbar[style],
                  .compose-editor .ql-snow .ql-toolbar.hidden,
                  .compose-editor .ql-snow .ql-toolbar.ql-hidden {
                    border-top: 1px solid #e5e7eb !important;
                    border-left: 1px solid #e5e7eb !important;
                    border-right: 1px solid #e5e7eb !important;
                    border-bottom: none !important;
                    padding: 8px !important;
                    border-radius: 0.5rem 0.5rem 0 0 !important;
                    display: flex !important;
                    flex-wrap: wrap !important;
                    align-items: center !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    position: relative !important;
                    z-index: 10 !important;
                    pointer-events: auto !important;
                    height: auto !important;
                    min-height: 42px !important;
                    max-height: none !important;
                    overflow: visible !important;
                    box-sizing: border-box !important;
                  }
                  /* Override ANY inline style - even more specific */
                  .compose-editor .ql-toolbar[style*="display: none"],
                  .compose-editor .ql-toolbar[style*="display:none"],
                  .compose-editor .ql-toolbar[style*="visibility: hidden"],
                  .compose-editor .ql-toolbar[style*="visibility:hidden"],
                  .compose-editor .ql-toolbar[style*="opacity: 0"],
                  .compose-editor .ql-toolbar[style*="opacity:0"] {
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                  }
                  .compose-editor .ql-toolbar .ql-formats {
                    display: inline-flex !important;
                    align-items: center !important;
                    vertical-align: middle !important;
                    margin-right: 8px !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                  }
                  .compose-editor .ql-toolbar button,
                  .compose-editor .ql-toolbar .ql-picker {
                    display: inline-block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    vertical-align: middle !important;
                    margin: 0 2px !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                  }
                  .compose-editor .ql-toolbar button:hover,
                  .compose-editor .ql-toolbar .ql-picker:hover {
                    opacity: 1 !important;
                    visibility: visible !important;
                  }
                  .compose-editor .ql-toolbar button.ql-active {
                    opacity: 1 !important;
                  }
                  .compose-editor .ql-toolbar .ql-picker-label {
                    display: inline-flex !important;
                    align-items: center !important;
                  }
                  .compose-editor .ql-toolbar .ql-picker {
                    position: relative !important;
                    z-index: auto !important;
                    display: inline-block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-expanded {
                    z-index: 1000 !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                  }
                  /* Base styles for picker options */
                  .compose-editor .ql-toolbar .ql-picker .ql-picker-options {
                    position: absolute !important;
                    background-color: #ffffff !important;
                    border: 1px solid #e5e7eb !important;
                    border-radius: 0.25rem !important;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
                    margin-top: 2px !important;
                    z-index: 1000 !important;
                  }
                  /* CRITICAL: Dropdown menus should be HIDDEN by default */
                  .compose-editor .ql-toolbar .ql-picker:not(.ql-expanded) .ql-picker-options {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                  }
                  /* Only show dropdown when picker is expanded - HIGHEST PRIORITY (must come after hidden rule) */
                  .compose-editor .ql-toolbar .ql-picker.ql-expanded .ql-picker-options,
                  .compose-editor .ql-toolbar .ql-picker.ql-expanded .ql-picker-options[style] {
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                  }
                  /* Ensure picker buttons are clickable */
                  .compose-editor .ql-toolbar .ql-picker-label {
                    cursor: pointer !important;
                    pointer-events: auto !important;
                    user-select: none !important;
                  }
                  .compose-editor .ql-toolbar .ql-picker {
                    cursor: pointer !important;
                    pointer-events: auto !important;
                  }
                  .compose-editor .ql-toolbar .ql-color-picker.ql-expanded .ql-picker-options,
                  .compose-editor .ql-toolbar .ql-background.ql-expanded .ql-picker-options {
                    z-index: 1001 !important;
                    width: 152px !important;
                  }
                  .compose-editor {
                    display: flex !important;
                    flex-direction: column !important;
                    height: 100% !important;
                    max-height: 100% !important;
                  }
                  .compose-editor .ql-container {
                    flex: 1 1 0% !important;
                    display: flex !important;
                    flex-direction: column !important;
                    overflow-y: scroll !important;
                    overflow-x: hidden !important;
                    font-size: 14px;
                    min-height: 0 !important;
                    height: 0 !important;
                    max-height: 100% !important;
                    border-radius: 0 0 0.5rem 0.5rem;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                    position: relative !important;
                  }
                  /* Force scrollbar to always be visible and styled */
                  .compose-editor .ql-container {
                    scrollbar-width: auto !important;
                    scrollbar-color: #888 #f1f1f1 !important;
                  }
                  /* Webkit scrollbar - make it prominent and always visible */
                  .compose-editor .ql-container::-webkit-scrollbar {
                    width: 14px !important;
                    -webkit-appearance: none !important;
                    display: block !important;
                  }
                  .compose-editor .ql-container::-webkit-scrollbar-track {
                    background: #f1f1f1 !important;
                    border-radius: 7px !important;
                    border: 1px solid #e5e7eb !important;
                    margin: 4px 0 !important;
                  }
                  .compose-editor .ql-container::-webkit-scrollbar-thumb {
                    background: #888 !important;
                    border-radius: 7px !important;
                    border: 2px solid #f1f1f1 !important;
                    min-height: 30px !important;
                  }
                  .compose-editor .ql-container::-webkit-scrollbar-thumb:hover {
                    background: #555 !important;
                  }
                  .compose-editor .ql-container::-webkit-scrollbar-thumb:active {
                    background: #333 !important;
                  }
                  .compose-editor .ql-container::-webkit-scrollbar-corner {
                    background: #f1f1f1 !important;
                  }
                  .compose-editor .ql-editor {
                    min-height: 250px;
                    padding: 12px;
                    padding-bottom: 24px;
                    text-align: left;
                    line-height: 1.15;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    white-space: pre-wrap;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                    display: block !important;
                    height: auto !important;
                    max-height: none !important;
                    flex: none !important;
                    overflow: visible !important;
                  }
                  .compose-editor .ql-editor:focus {
                    outline: none;
                  }
                  .compose-editor .ql-editor p {
                    margin: 0;
                    white-space: pre-wrap;
                  }
                  .compose-editor .ql-editor p[style*="margin-bottom"] {
                    display: block;
                  }
                  .compose-editor .ql-editor p:empty {
                    min-height: 1em;
                  }
                  .compose-editor .ql-editor div {
                    white-space: pre-wrap;
                  }
                  .compose-editor .ql-editor.ql-blank::before {
                    left: 12px;
                    right: 12px;
                    text-align: left;
                    font-style: normal;
                    color: #9ca3af;
                  }
                  .compose-editor .ql-editor h1,
                  .compose-editor .ql-editor h2,
                  .compose-editor .ql-editor h3 {
                    margin: 16px 0 12px 0;
                    line-height: 1.4;
                    font-weight: 600;
                  }
                  .compose-editor .ql-editor ul,
                  .compose-editor .ql-editor ol {
                    margin: 12px 0;
                    padding-left: 24px;
                  }
                  .compose-editor .ql-editor li {
                    margin: 4px 0;
                    line-height: 1.15;
                  }
                  .compose-editor .ql-editor blockquote {
                    margin: 16px 0;
                    padding-left: 16px;
                    border-left: 4px solid #e5e7eb;
                    color: #6b7280;
                  }
                  .compose-editor .ql-editor table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 16px 0;
                  }
                  .compose-editor .ql-editor table td,
                  .compose-editor .ql-editor table th {
                    border: 1px solid #e5e7eb;
                    padding: 8px 12px;
                    text-align: left;
                  }
                  .compose-editor .ql-editor table th {
                    background-color: #f9fafb;
                    font-weight: 600;
                  }
                  .compose-editor .ql-editor img {
                    max-width: 100%;
                    height: auto;
                    margin: 12px 0;
                  }
                  .compose-editor .ql-editor a {
                    color: #2563eb;
                    text-decoration: underline;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] {
                    pointer-events: none;
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] * {
                    pointer-events: none;
                    max-width: 100%;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"],
                  .compose-editor .ql-editor div.preserved-email-content,
                  .compose-editor .ql-editor div[data-quill-preserve="true"] {
                    /* Preserve structure while maintaining wrapper styles */
                    display: block !important;
                    border-left: 3px solid #ccc !important;
                    margin: 10px 0 !important;
                    padding: 10px 0 10px 15px !important;
                    background-color: #f9f9f9 !important;
                    overflow-x: auto !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] * {
                    /* Preserve all child element styles */
                    box-sizing: border-box !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] table {
                    width: 100% !important;
                    max-width: 100% !important;
                    border-collapse: collapse !important;
                    margin: 12px 0 !important;
                    table-layout: auto !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] table td,
                  .compose-editor .ql-editor div[contenteditable="false"] table th {
                    border: 1px solid #d1d5db !important;
                    padding: 8px 12px !important;
                    vertical-align: top !important;
                    text-align: left !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] img {
                    max-width: 100% !important;
                    height: auto !important;
                    display: block !important;
                    margin: 8px 0 !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] p {
                    margin: 8px 0 !important;
                    line-height: 1.6 !important;
                    display: block !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] div {
                    /* Don't reset margin/padding for nested divs - preserve original structure */
                    display: block !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] span {
                    display: inline !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] a {
                    color: #2563eb !important;
                    text-decoration: underline !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] ul,
                  .compose-editor .ql-editor div[contenteditable="false"] ol {
                    margin: 12px 0 !important;
                    padding-left: 24px !important;
                    display: block !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] li {
                    margin: 4px 0 !important;
                    display: list-item !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] h1,
                  .compose-editor .ql-editor div[contenteditable="false"] h2,
                  .compose-editor .ql-editor div[contenteditable="false"] h3,
                  .compose-editor .ql-editor div[contenteditable="false"] h4,
                  .compose-editor .ql-editor div[contenteditable="false"] h5,
                  .compose-editor .ql-editor div[contenteditable="false"] h6 {
                    margin: 16px 0 12px 0 !important;
                    font-weight: 600 !important;
                    display: block !important;
                  }
                  .compose-editor .ql-editor div[contenteditable="false"] blockquote {
                    margin: 16px 0 !important;
                    padding-left: 16px !important;
                    border-left: 4px solid #e5e7eb !important;
                    display: block !important;
                  }
                  .compose-editor .ql-editor.ql-blank::before {
                    left: 16px;
                    right: 16px;
                    text-align: left;
                    font-style: normal;
                    color: #9ca3af;
                    font-size: 14px;
                  }
                  /* Line spacing and paragraph spacing picker styles */
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing,
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing {
                    width: 140px;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-label::before {
                    content: 'Line Spacing';
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.0"]::before { content: '1.0'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.15"]::before { content: '1.15'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.5"]::before { content: '1.5'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.75"]::before { content: '1.75'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="2.0"]::before { content: '2.0'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="2.5"]::before { content: '2.5'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="3.0"]::before { content: '3.0'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-label::before {
                    content: 'Paragraph Spacing';
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="0"]::before { content: '0'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="0.5em"]::before { content: '0.5em'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="1em"]::before { content: '1em'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="1.5em"]::before { content: '1.5em'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="2em"]::before { content: '2em'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="2.5em"]::before { content: '2.5em'; }
                  .compose-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="3em"]::before { content: '3em'; }
                  /* Keep font picker compact and avoid overflow */
                  .compose-editor .ql-toolbar .ql-picker.ql-font {
                    max-width: 160px;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label,
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label::before,
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label::after {
                    white-space: nowrap;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: inline-block;
                    max-width: 160px;
                    vertical-align: middle;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-options {
                    min-width: 180px;
                    max-height: 300px;
                    overflow-y: auto;
                    overflow-x: hidden;
                  }
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item,
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item::before,
                  .compose-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item::after {
                    white-space: nowrap;
                  }
                  
                  /* Font Family Styles - ReactQuill applies fonts via classes */
                  /* Critical: ReactQuill uses lowercase class names without spaces */
                  
                  /* Global font classes - ReactQuill requires these to work */
                  /* These must be global (not scoped) for ReactQuill to recognize them */
                  .ql-font-arial,
                  *[class*="ql-font-arial"] {
                    font-family: Arial, sans-serif !important;
                  }
                  .ql-font-timesnewroman,
                  *[class*="ql-font-timesnewroman"] {
                    font-family: 'Times New Roman', Times, serif !important;
                  }
                  .ql-font-helvetica,
                  *[class*="ql-font-helvetica"] {
                    font-family: Helvetica, Arial, sans-serif !important;
                  }
                  .ql-font-georgia,
                  *[class*="ql-font-georgia"] {
                    font-family: Georgia, serif !important;
                  }
                  .ql-font-verdana,
                  *[class*="ql-font-verdana"] {
                    font-family: Verdana, Geneva, sans-serif !important;
                  }
                  .ql-font-trebuchetms,
                  *[class*="ql-font-trebuchetms"] {
                    font-family: 'Trebuchet MS', Helvetica, sans-serif !important;
                  }
                  .ql-font-tahoma,
                  *[class*="ql-font-tahoma"] {
                    font-family: Tahoma, Geneva, sans-serif !important;
                  }
                  .ql-font-couriernew,
                  *[class*="ql-font-couriernew"] {
                    font-family: 'Courier New', Courier, monospace !important;
                  }
                  .ql-font-lucidasansunicode,
                  *[class*="ql-font-lucidasansunicode"] {
                    font-family: 'Lucida Sans Unicode', 'Lucida Grande', sans-serif !important;
                  }
                  .ql-font-palatinolinotype,
                  *[class*="ql-font-palatinolinotype"] {
                    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif !important;
                  }
                  .ql-font-cambria,
                  *[class*="ql-font-cambria"] {
                    font-family: Cambria, serif !important;
                  }
                  .ql-font-calistomt,
                  *[class*="ql-font-calistomt"] {
                    font-family: 'Calisto MT', serif !important;
                  }
                  
                  /* Apply fonts within compose editor - scoped rules with maximum specificity */
                  .compose-editor .ql-editor .ql-font-arial,
                  .compose-editor .ql-editor span.ql-font-arial,
                  .compose-editor .ql-editor p.ql-font-arial,
                  .compose-editor .ql-editor div.ql-font-arial,
                  .compose-editor .ql-editor strong.ql-font-arial,
                  .compose-editor .ql-editor em.ql-font-arial,
                  .compose-editor .ql-editor *[class*="ql-font-arial"] {
                    font-family: Arial, sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-timesnewroman,
                  .compose-editor .ql-editor span.ql-font-timesnewroman,
                  .compose-editor .ql-editor p.ql-font-timesnewroman,
                  .compose-editor .ql-editor div.ql-font-timesnewroman,
                  .compose-editor .ql-editor strong.ql-font-timesnewroman,
                  .compose-editor .ql-editor em.ql-font-timesnewroman,
                  .compose-editor .ql-editor *[class*="ql-font-timesnewroman"] {
                    font-family: 'Times New Roman', Times, serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-helvetica,
                  .compose-editor .ql-editor span.ql-font-helvetica,
                  .compose-editor .ql-editor p.ql-font-helvetica,
                  .compose-editor .ql-editor div.ql-font-helvetica,
                  .compose-editor .ql-editor strong.ql-font-helvetica,
                  .compose-editor .ql-editor em.ql-font-helvetica,
                  .compose-editor .ql-editor *[class*="ql-font-helvetica"] {
                    font-family: Helvetica, Arial, sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-georgia,
                  .compose-editor .ql-editor span.ql-font-georgia,
                  .compose-editor .ql-editor p.ql-font-georgia,
                  .compose-editor .ql-editor div.ql-font-georgia,
                  .compose-editor .ql-editor strong.ql-font-georgia,
                  .compose-editor .ql-editor em.ql-font-georgia,
                  .compose-editor .ql-editor *[class*="ql-font-georgia"] {
                    font-family: Georgia, serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-verdana,
                  .compose-editor .ql-editor span.ql-font-verdana,
                  .compose-editor .ql-editor p.ql-font-verdana,
                  .compose-editor .ql-editor div.ql-font-verdana,
                  .compose-editor .ql-editor strong.ql-font-verdana,
                  .compose-editor .ql-editor em.ql-font-verdana,
                  .compose-editor .ql-editor *[class*="ql-font-verdana"] {
                    font-family: Verdana, Geneva, sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-trebuchetms,
                  .compose-editor .ql-editor span.ql-font-trebuchetms,
                  .compose-editor .ql-editor p.ql-font-trebuchetms,
                  .compose-editor .ql-editor div.ql-font-trebuchetms,
                  .compose-editor .ql-editor strong.ql-font-trebuchetms,
                  .compose-editor .ql-editor em.ql-font-trebuchetms,
                  .compose-editor .ql-editor *[class*="ql-font-trebuchetms"] {
                    font-family: 'Trebuchet MS', Helvetica, sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-tahoma,
                  .compose-editor .ql-editor span.ql-font-tahoma,
                  .compose-editor .ql-editor p.ql-font-tahoma,
                  .compose-editor .ql-editor div.ql-font-tahoma,
                  .compose-editor .ql-editor strong.ql-font-tahoma,
                  .compose-editor .ql-editor em.ql-font-tahoma,
                  .compose-editor .ql-editor *[class*="ql-font-tahoma"] {
                    font-family: Tahoma, Geneva, sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-couriernew,
                  .compose-editor .ql-editor span.ql-font-couriernew,
                  .compose-editor .ql-editor p.ql-font-couriernew,
                  .compose-editor .ql-editor div.ql-font-couriernew,
                  .compose-editor .ql-editor strong.ql-font-couriernew,
                  .compose-editor .ql-editor em.ql-font-couriernew,
                  .compose-editor .ql-editor *[class*="ql-font-couriernew"] {
                    font-family: 'Courier New', Courier, monospace !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-lucidasansunicode,
                  .compose-editor .ql-editor span.ql-font-lucidasansunicode,
                  .compose-editor .ql-editor p.ql-font-lucidasansunicode,
                  .compose-editor .ql-editor div.ql-font-lucidasansunicode,
                  .compose-editor .ql-editor strong.ql-font-lucidasansunicode,
                  .compose-editor .ql-editor em.ql-font-lucidasansunicode,
                  .compose-editor .ql-editor *[class*="ql-font-lucidasansunicode"] {
                    font-family: 'Lucida Sans Unicode', 'Lucida Grande', sans-serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-palatinolinotype,
                  .compose-editor .ql-editor span.ql-font-palatinolinotype,
                  .compose-editor .ql-editor p.ql-font-palatinolinotype,
                  .compose-editor .ql-editor div.ql-font-palatinolinotype,
                  .compose-editor .ql-editor strong.ql-font-palatinolinotype,
                  .compose-editor .ql-editor em.ql-font-palatinolinotype,
                  .compose-editor .ql-editor *[class*="ql-font-palatinolinotype"] {
                    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-cambria,
                  .compose-editor .ql-editor span.ql-font-cambria,
                  .compose-editor .ql-editor p.ql-font-cambria,
                  .compose-editor .ql-editor div.ql-font-cambria,
                  .compose-editor .ql-editor strong.ql-font-cambria,
                  .compose-editor .ql-editor em.ql-font-cambria,
                  .compose-editor .ql-editor *[class*="ql-font-cambria"] {
                    font-family: Cambria, serif !important;
                  }
                  
                  .compose-editor .ql-editor .ql-font-calistomt,
                  .compose-editor .ql-editor span.ql-font-calistomt,
                  .compose-editor .ql-editor p.ql-font-calistomt,
                  .compose-editor .ql-editor div.ql-font-calistomt,
                  .compose-editor .ql-editor strong.ql-font-calistomt,
                  .compose-editor .ql-editor em.ql-font-calistomt,
                  .compose-editor .ql-editor *[class*="ql-font-calistomt"] {
                    font-family: 'Calisto MT', serif !important;
                  }
                  
                  /* Force font application via inline styles - ReactQuill may use inline styles */
                  .compose-editor .ql-editor [style*="font-family: Arial"],
                  .compose-editor .ql-editor [style*="font-family:Arial"],
                  .compose-editor .ql-editor [style*="font-family: 'Arial'"],
                  .compose-editor .ql-editor [style*="font-family:'Arial'"] {
                    font-family: Arial, sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: 'Times New Roman'"],
                  .compose-editor .ql-editor [style*="font-family:'Times New Roman'"],
                  .compose-editor .ql-editor [style*="font-family: Times New Roman"],
                  .compose-editor .ql-editor [style*="font-family:TimesNewRoman"] {
                    font-family: 'Times New Roman', Times, serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: Helvetica"],
                  .compose-editor .ql-editor [style*="font-family:Helvetica"],
                  .compose-editor .ql-editor [style*="font-family: 'Helvetica'"],
                  .compose-editor .ql-editor [style*="font-family:'Helvetica'"] {
                    font-family: Helvetica, Arial, sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: Georgia"],
                  .compose-editor .ql-editor [style*="font-family:Georgia"],
                  .compose-editor .ql-editor [style*="font-family: 'Georgia'"],
                  .compose-editor .ql-editor [style*="font-family:'Georgia'"] {
                    font-family: Georgia, serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: Verdana"],
                  .compose-editor .ql-editor [style*="font-family:Verdana"],
                  .compose-editor .ql-editor [style*="font-family: 'Verdana'"],
                  .compose-editor .ql-editor [style*="font-family:'Verdana'"] {
                    font-family: Verdana, Geneva, sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: 'Trebuchet MS'"],
                  .compose-editor .ql-editor [style*="font-family:'Trebuchet MS'"],
                  .compose-editor .ql-editor [style*="font-family: Trebuchet MS"],
                  .compose-editor .ql-editor [style*="font-family:TrebuchetMS"] {
                    font-family: 'Trebuchet MS', Helvetica, sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: Tahoma"],
                  .compose-editor .ql-editor [style*="font-family:Tahoma"],
                  .compose-editor .ql-editor [style*="font-family: 'Tahoma'"],
                  .compose-editor .ql-editor [style*="font-family:'Tahoma'"] {
                    font-family: Tahoma, Geneva, sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: 'Courier New'"],
                  .compose-editor .ql-editor [style*="font-family:'Courier New'"],
                  .compose-editor .ql-editor [style*="font-family: Courier New"],
                  .compose-editor .ql-editor [style*="font-family:CourierNew"] {
                    font-family: 'Courier New', Courier, monospace !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: 'Lucida Sans Unicode'"],
                  .compose-editor .ql-editor [style*="font-family:'Lucida Sans Unicode'"],
                  .compose-editor .ql-editor [style*="font-family: Lucida Sans Unicode"],
                  .compose-editor .ql-editor [style*="font-family:LucidaSansUnicode"] {
                    font-family: 'Lucida Sans Unicode', 'Lucida Grande', sans-serif !important;
                  }
                  .compose-editor .ql-editor [style*="font-family: 'Palatino Linotype'"],
                  .compose-editor .ql-editor [style*="font-family:'Palatino Linotype'"],
                  .compose-editor .ql-editor [style*="font-family: Palatino Linotype"],
                  .compose-editor .ql-editor [style*="font-family:PalatinoLinotype"] {
                    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif !important;
                  }
                  
                  /* Ensure font inheritance for elements WITHOUT font classes or inline styles */
                  .compose-editor .ql-editor p:not(.ql-font-arial):not(.ql-font-timesnewroman):not(.ql-font-helvetica):not(.ql-font-georgia):not(.ql-font-verdana):not(.ql-font-trebuchetms):not(.ql-font-tahoma):not(.ql-font-couriernew):not(.ql-font-lucidasansunicode):not(.ql-font-palatinolinotype):not(.ql-font-cambria):not(.ql-font-calistomt):not([style*="font-family"]),
                  .compose-editor .ql-editor h1:not(.ql-font-arial):not(.ql-font-timesnewroman):not(.ql-font-helvetica):not(.ql-font-georgia):not(.ql-font-verdana):not(.ql-font-trebuchetms):not(.ql-font-tahoma):not(.ql-font-couriernew):not(.ql-font-lucidasansunicode):not(.ql-font-palatinolinotype):not(.ql-font-cambria):not(.ql-font-calistomt):not([style*="font-family"]),
                  .compose-editor .ql-editor h2:not(.ql-font-arial):not(.ql-font-timesnewroman):not(.ql-font-helvetica):not(.ql-font-georgia):not(.ql-font-verdana):not(.ql-font-trebuchetms):not(.ql-font-tahoma):not(.ql-font-couriernew):not(.ql-font-lucidasansunicode):not(.ql-font-palatinolinotype):not(.ql-font-cambria):not(.ql-font-calistomt):not([style*="font-family"]),
                  .compose-editor .ql-editor h3:not(.ql-font-arial):not(.ql-font-timesnewroman):not(.ql-font-helvetica):not(.ql-font-georgia):not(.ql-font-verdana):not(.ql-font-trebuchetms):not(.ql-font-tahoma):not(.ql-font-couriernew):not(.ql-font-lucidasansunicode):not(.ql-font-palatinolinotype):not(.ql-font-cambria):not(.ql-font-calistomt):not([style*="font-family"]) {
                    font-family: inherit;
                  }
                  
                  /* Fix font picker dropdown labels - map tokens to friendly names */
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before {
                    content: 'Arial' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="timesnewroman"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="timesnewroman"]::before {
                    content: 'Times New Roman' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="helvetica"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="helvetica"]::before {
                    content: 'Helvetica' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before {
                    content: 'Georgia' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="verdana"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="verdana"]::before {
                    content: 'Verdana' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="trebuchetms"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="trebuchetms"]::before {
                    content: 'Trebuchet MS' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="tahoma"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="tahoma"]::before {
                    content: 'Tahoma' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="couriernew"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="couriernew"]::before {
                    content: 'Courier New' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="lucidasansunicode"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="lucidasansunicode"]::before {
                    content: 'Lucida Sans Unicode' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="palatinolinotype"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="palatinolinotype"]::before {
                    content: 'Palatino Linotype' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="cambria"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="cambria"]::before {
                    content: 'Cambria' !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value="calistomt"]::before,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value="calistomt"]::before {
                    content: 'Calisto MT' !important;
                  }
                  
                  /* Font Size Styles - Numeric sizes like MS Word */
                  /* Apply to all possible elements that Quill might use */
                  .compose-editor .ql-editor .ql-size-8,
                  .compose-editor .ql-editor span.ql-size-8,
                  .compose-editor .ql-editor p.ql-size-8,
                  .compose-editor .ql-editor div.ql-size-8,
                  .compose-editor .ql-editor strong.ql-size-8,
                  .compose-editor .ql-editor em.ql-size-8,
                  .compose-editor .ql-editor u.ql-size-8,
                  .compose-editor .ql-editor *[class*="ql-size-8"] {
                    font-size: 8px !important;
                  }
                  .compose-editor .ql-editor .ql-size-9,
                  .compose-editor .ql-editor span.ql-size-9,
                  .compose-editor .ql-editor p.ql-size-9,
                  .compose-editor .ql-editor div.ql-size-9,
                  .compose-editor .ql-editor strong.ql-size-9,
                  .compose-editor .ql-editor em.ql-size-9,
                  .compose-editor .ql-editor u.ql-size-9,
                  .compose-editor .ql-editor *[class*="ql-size-9"] {
                    font-size: 9px !important;
                  }
                  .compose-editor .ql-editor .ql-size-10,
                  .compose-editor .ql-editor span.ql-size-10,
                  .compose-editor .ql-editor p.ql-size-10,
                  .compose-editor .ql-editor div.ql-size-10,
                  .compose-editor .ql-editor strong.ql-size-10,
                  .compose-editor .ql-editor em.ql-size-10,
                  .compose-editor .ql-editor u.ql-size-10,
                  .compose-editor .ql-editor *[class*="ql-size-10"] {
                    font-size: 10px !important;
                  }
                  .compose-editor .ql-editor .ql-size-11,
                  .compose-editor .ql-editor span.ql-size-11,
                  .compose-editor .ql-editor p.ql-size-11,
                  .compose-editor .ql-editor div.ql-size-11,
                  .compose-editor .ql-editor strong.ql-size-11,
                  .compose-editor .ql-editor em.ql-size-11,
                  .compose-editor .ql-editor u.ql-size-11,
                  .compose-editor .ql-editor *[class*="ql-size-11"] {
                    font-size: 11px !important;
                  }
                  .compose-editor .ql-editor .ql-size-12,
                  .compose-editor .ql-editor span.ql-size-12,
                  .compose-editor .ql-editor p.ql-size-12,
                  .compose-editor .ql-editor div.ql-size-12,
                  .compose-editor .ql-editor strong.ql-size-12,
                  .compose-editor .ql-editor em.ql-size-12,
                  .compose-editor .ql-editor u.ql-size-12,
                  .compose-editor .ql-editor *[class*="ql-size-12"] {
                    font-size: 12px !important;
                  }
                  .compose-editor .ql-editor .ql-size-14,
                  .compose-editor .ql-editor span.ql-size-14,
                  .compose-editor .ql-editor p.ql-size-14,
                  .compose-editor .ql-editor div.ql-size-14,
                  .compose-editor .ql-editor strong.ql-size-14,
                  .compose-editor .ql-editor em.ql-size-14,
                  .compose-editor .ql-editor u.ql-size-14,
                  .compose-editor .ql-editor *[class*="ql-size-14"] {
                    font-size: 14px !important;
                  }
                  .compose-editor .ql-editor .ql-size-16,
                  .compose-editor .ql-editor span.ql-size-16,
                  .compose-editor .ql-editor p.ql-size-16,
                  .compose-editor .ql-editor div.ql-size-16,
                  .compose-editor .ql-editor strong.ql-size-16,
                  .compose-editor .ql-editor em.ql-size-16,
                  .compose-editor .ql-editor u.ql-size-16,
                  .compose-editor .ql-editor *[class*="ql-size-16"] {
                    font-size: 16px !important;
                  }
                  .compose-editor .ql-editor .ql-size-18,
                  .compose-editor .ql-editor span.ql-size-18,
                  .compose-editor .ql-editor p.ql-size-18,
                  .compose-editor .ql-editor div.ql-size-18,
                  .compose-editor .ql-editor strong.ql-size-18,
                  .compose-editor .ql-editor em.ql-size-18,
                  .compose-editor .ql-editor u.ql-size-18,
                  .compose-editor .ql-editor *[class*="ql-size-18"] {
                    font-size: 18px !important;
                  }
                  .compose-editor .ql-editor .ql-size-20,
                  .compose-editor .ql-editor span.ql-size-20,
                  .compose-editor .ql-editor p.ql-size-20,
                  .compose-editor .ql-editor div.ql-size-20,
                  .compose-editor .ql-editor strong.ql-size-20,
                  .compose-editor .ql-editor em.ql-size-20,
                  .compose-editor .ql-editor u.ql-size-20,
                  .compose-editor .ql-editor *[class*="ql-size-20"] {
                    font-size: 20px !important;
                  }
                  .compose-editor .ql-editor .ql-size-22,
                  .compose-editor .ql-editor span.ql-size-22,
                  .compose-editor .ql-editor p.ql-size-22,
                  .compose-editor .ql-editor div.ql-size-22,
                  .compose-editor .ql-editor strong.ql-size-22,
                  .compose-editor .ql-editor em.ql-size-22,
                  .compose-editor .ql-editor u.ql-size-22,
                  .compose-editor .ql-editor *[class*="ql-size-22"] {
                    font-size: 22px !important;
                  }
                  .compose-editor .ql-editor .ql-size-24,
                  .compose-editor .ql-editor span.ql-size-24,
                  .compose-editor .ql-editor p.ql-size-24,
                  .compose-editor .ql-editor div.ql-size-24,
                  .compose-editor .ql-editor strong.ql-size-24,
                  .compose-editor .ql-editor em.ql-size-24,
                  .compose-editor .ql-editor u.ql-size-24,
                  .compose-editor .ql-editor *[class*="ql-size-24"] {
                    font-size: 24px !important;
                  }
                  
                  /* Hide default text and show our custom content */
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value] span,
                  .compose-editor .ql-picker.ql-font .ql-picker-item[data-value] span {
                    display: none !important;
                  }
                  
                  /* Override default "Sans Serif" label when no font is selected */
                  .compose-editor .ql-picker.ql-font .ql-picker-label:not([data-value])::before {
                    content: 'Sans Serif' !important;
                  }
                  
                  /* Ensure font picker shows friendly names, not raw values */
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value]::before {
                    display: inline-block !important;
                  }
                  .compose-editor .ql-picker.ql-font .ql-picker-label[data-value]::after {
                    display: none !important;
                  }
                  
                  /* Font Size Picker - Show numeric values (SizeStyle uses pixel values like "8px") */
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="8px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="8px"]::before {
                    content: '8' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="9px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="9px"]::before {
                    content: '9' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before {
                    content: '10' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="11px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="11px"]::before {
                    content: '11' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before {
                    content: '12' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before {
                    content: '14' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before {
                    content: '16' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before {
                    content: '18' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before {
                    content: '20' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="22px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="22px"]::before {
                    content: '22' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before {
                    content: '24' !important;
                  }
                  /* Hide default text in size picker */
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value] span,
                  .compose-editor .ql-picker.ql-size .ql-picker-item[data-value] span {
                    display: none !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-label[data-value]::after {
                    display: none !important;
                  }
                  /* Show default "Normal" when no size is selected */
                  .compose-editor .ql-picker.ql-size .ql-picker-label:not([data-value])::before {
                    content: 'Normal' !important;
                  }
                  .compose-editor .ql-picker.ql-size .ql-picker-options {
                    max-height: 300px;
                    overflow-y: auto;
                    overflow-x: hidden;
                  }
                `}</style>

              {/* Attachments */}
              {attachmentFiles.length > 0 && (
                <div 
                  className="px-4 py-2 border-t border-gray-200 flex-shrink-0 bg-white"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {attachmentFiles.map((file, index) => (
                      <div key={index} className="flex items-center space-x-2 px-2 py-1 bg-gray-100 rounded text-sm">
                        <Paperclip className="h-3 w-3 text-gray-600" />
                        <span className="text-xs text-gray-700">{file.name}</span>
                        <button
                          onClick={() => handleRemoveAttachment(index)}
                          className="ml-1 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div 
                className="px-4 py-3 border-t border-gray-200 flex items-center justify-between flex-shrink-0 bg-white z-10"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center space-x-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      onChange={handleAttachmentChange}
                      className="hidden"
                    />
                    <Paperclip className="h-5 w-5 text-gray-600 hover:text-gray-800 cursor-pointer" />
                  </label>
                  {/* Delete Draft button - only show when editing a draft */}
                  {editingDraftId && (
                    <button
                      onClick={() => handleDeleteDraft(editingDraftId)}
                      disabled={deleteDraftMutation.isLoading}
                      className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete this draft permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{deleteDraftMutation.isLoading ? 'Deleting...' : 'Delete Draft'}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCloseCompose('discard')}
                    disabled={isSending}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={isSending}
                    className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Draft Save Confirmation Dialog */}
      {showDraftConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Save as Draft?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              You have unsaved changes. Would you like to save this as a draft before closing?
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={handleConfirmDiscard}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleCancelDraftConfirm}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSaveDraft}
                disabled={saveDraftMutation.isLoading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveDraftMutation.isLoading ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal - Post-Send Flow */}
      {showAddClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Add Client to CRM
                </h2>
                <button
                  onClick={() => {
                    setShowAddClientModal(false);
                    setShowCompose(false);
                    resetComposeData();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                Add this recipient as a client to enable automated follow-ups. Threading information has been captured from the email you just sent.
              </p>

              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const submitData = {
                    name: addClientData.name || addClientData.email.split('@')[0] || 'Client',
                    email: addClientData.email,
                    country: addClientData.country || undefined,
                    conferenceId: addClientData.conferenceId || undefined,
                    threadRootMessageId: addClientData.threadRootMessageId,
                    initialEmailSubject: addClientData.initialEmailSubject
                  };

                  await axios.post('/api/clients', submitData);
                  toast.success('Client added successfully with threading info');
                  setShowAddClientModal(false);
                  setShowCompose(false);
                  resetComposeData();
                } catch (error) {
                  console.error('Add client error:', error);
                  const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add client';
                  toast.error(errorMessage);
                }
              }} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={addClientData.name}
                    onChange={(e) => setAddClientData({ ...addClientData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={addClientData.email}
                    onChange={(e) => setAddClientData({ ...addClientData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={addClientData.country}
                    onChange={(e) => setAddClientData({ ...addClientData, country: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter country (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conference
                  </label>
                  <select
                    value={addClientData.conferenceId}
                    onChange={(e) => setAddClientData({ ...addClientData, conferenceId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">No Conference Selected</option>
                    {assignedConferences?.map(conference => (
                      <option key={conference.id} value={conference.id}>
                        {conference.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Select a conference to enable automated follow-up emails
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Threading Information (Auto-filled)</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-blue-800">Thread Root Message-ID:</span>
                      <p className="text-blue-700 break-all mt-1">{addClientData.threadRootMessageId || 'Not available'}</p>
                    </div>
                    <div>
                      <span className="font-medium text-blue-800">Initial Email Subject:</span>
                      <p className="text-blue-700 break-words mt-1">{addClientData.initialEmailSubject || 'Not available'}</p>
                    </div>
                    <p className="text-blue-600 text-xs mt-2">
                      Follow-up emails will use this information to maintain a single Gmail thread.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClientModal(false);
                      resetComposeData();
                    }}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add Client
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedEmail;
