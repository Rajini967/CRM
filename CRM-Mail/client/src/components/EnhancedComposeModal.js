import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  XCircle,
  User,
  Mail,
  FileText,
  Send,
  Save,
  Eye,
  EyeOff,
  ChevronDown,
  Search,
  Plus,
  Trash2,
  Paperclip,
  Star,
  Clock,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

const EnhancedComposeModal = ({ 
  initialData, 
  onSend, 
  onClose, 
  clients = [], 
  templates = []
}) => {
  const [formData, setFormData] = useState({
    to: initialData?.to || '',
    cc: initialData?.cc || '',
    bcc: initialData?.bcc || '',
    subject: initialData?.subject || '',
    body: initialData?.body || '',
    bodyText: initialData?.bodyText || '',
    isDraft: initialData?.isDraft || false,
    clientId: initialData?.clientId || null,
    templateId: initialData?.templateId || null
  });

  const [showClientSelector, setShowClientSelector] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const queryClient = useQueryClient();

  // Auto-select client if provided in initialData
  useEffect(() => {
    if (initialData?.clientId && clients && clients.length > 0) {
      const client = clients.find(c => c && c.id === initialData.clientId);
      if (client && client.email) {
        setSelectedClient(client);
        setFormData(prev => ({
          ...prev,
          to: client.email,
          clientId: client.id
        }));
      }
    }
  }, [initialData?.clientId, clients]);

  // Filter clients based on search
  const filteredClients = (clients || []).filter(client =>
    client && (
      (client.name || '').toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      (client.email || '').toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      (client.country || '').toLowerCase().includes(clientSearchTerm.toLowerCase())
    )
  );

  // Filter templates based on search
  const filteredTemplates = (templates || []).filter(template =>
    template && (
      (template.name || '').toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
      (template.subject || '').toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
      (template.stage || '').toLowerCase().includes(templateSearchTerm.toLowerCase())
    )
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.to.trim()) {
      toast.error('Recipient email is required');
      return;
    }
    if (!formData.subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!formData.body.trim()) {
      toast.error('Message body is required');
      return;
    }
    onSend(formData);
  };

  const handleSaveDraft = () => {
    const draftData = { ...formData, isDraft: true };
    onSend(draftData);
  };

  const handleClientSelect = (client) => {
    if (client && client.id && client.email) {
      setSelectedClient(client);
      setFormData(prev => ({
        ...prev,
        to: client.email,
        clientId: client.id
      }));
      setShowClientSelector(false);
      setClientSearchTerm('');
    }
  };

  const handleTemplateSelect = (template) => {
    if (template && template.id) {
      setSelectedTemplate(template);
      setFormData(prev => ({
        ...prev,
        subject: template.subject || '',
        body: template.bodyHtml || '',
        bodyText: template.bodyText || '',
        templateId: template.id
      }));
      setShowTemplateSelector(false);
      setTemplateSearchTerm('');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const insertTemplateVariable = (variable) => {
    const textarea = document.getElementById('body');
    if (textarea && variable) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const text = textarea.value || '';
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      const newText = before + `{{${variable}}}` + after;
      
      setFormData(prev => ({ ...prev, body: newText }));
      
      // Set cursor position after the inserted text
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = start + variable.length + 4;
          textarea.focus();
        }
      }, 0);
    }
  };

  const templateVariables = [
    { key: 'client_name', label: 'Client Name' },
    { key: 'client_email', label: 'Client Email' },
    { key: 'client_country', label: 'Client Country' },
    { key: 'conference_name', label: 'Conference Name' },
    { key: 'conference_date', label: 'Conference Date' },
    { key: 'conference_venue', label: 'Conference Venue' },
    { key: 'abstract_deadline', label: 'Abstract Deadline' },
    { key: 'registration_deadline', label: 'Registration Deadline' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <form onSubmit={handleSubmit} className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {formData.isDraft ? 'Save Draft' : 'Compose Email'}
            </h3>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title={isPreviewMode ? 'Edit Mode' : 'Preview Mode'}
              >
                {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Client and Template Selectors */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Client Selector */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Client
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    onFocus={() => setShowClientSelector(true)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                
                {showClientSelector && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">No clients found</div>
                    ) : (
                      filteredClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleClientSelect(client)}
                          className="w-full text-left p-3 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{client.name || 'Unknown Client'}</div>
                          <div className="text-sm text-gray-600">{client.email || 'No email'}</div>
                          <div className="text-xs text-gray-500">{client.country || 'Unknown'} • {client.status || 'Unknown'}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Template Selector */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Template
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    onFocus={() => setShowTemplateSelector(true)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                
                {showTemplateSelector && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredTemplates.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">No templates found</div>
                    ) : (
                      filteredTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleTemplateSelect(template)}
                          className="w-full text-left p-3 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{template.name || 'Unnamed Template'}</div>
                          <div className="text-sm text-gray-600">{template.subject || 'No subject'}</div>
                          <div className="text-xs text-gray-500">{template.stage || 'Unknown'} • {template.isActive ? 'Active' : 'Inactive'}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Client and Template Info */}
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedClient && selectedClient.id && (
                <div className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  <User className="h-4 w-4" />
                  <span>{selectedClient.name || 'Unknown Client'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(null);
                      setFormData(prev => ({ ...prev, to: '', clientId: null }));
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedTemplate && selectedTemplate.id && (
                <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                  <FileText className="h-4 w-4" />
                  <span>{selectedTemplate.name || 'Unnamed Template'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(null);
                      setFormData(prev => ({ ...prev, subject: '', body: '', bodyText: '', templateId: null }));
                    }}
                    className="text-green-600 hover:text-green-800"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Email Form */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-4">
                {/* Recipients */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    To <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="to"
                    value={formData.to}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    placeholder="recipient@example.com"
                  />
                </div>

                {/* Advanced Options */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    <span>Advanced Options</span>
                  </button>
                  
                  {showAdvanced && (
                    <div className="mt-2 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                        <input
                          type="email"
                          name="cc"
                          value={formData.cc}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="cc@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">BCC</label>
                        <input
                          type="email"
                          name="bcc"
                          value={formData.bcc}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="bcc@example.com"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    placeholder="Email subject"
                  />
                </div>

                {/* Message Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message <span className="text-red-500">*</span>
                  </label>
                  {isPreviewMode ? (
                    <div 
                      className="w-full min-h-[300px] p-3 border border-gray-300 rounded-lg bg-gray-50 prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: formData.body }}
                    />
                  ) : (
                    <textarea
                      id="body"
                      name="body"
                      value={formData.body}
                      onChange={handleChange}
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      placeholder="Type your message here..."
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Template Variables Sidebar */}
            {!isPreviewMode && (
              <div className="w-64 p-4 border-l border-gray-200 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Template Variables</h4>
                <div className="space-y-2">
                  {templateVariables.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => insertTemplateVariable(variable.key)}
                      className="w-full text-left p-2 text-sm text-gray-700 hover:bg-gray-200 rounded border border-gray-300"
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Quick Actions
                  </h5>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        const textarea = document.getElementById('body');
                        if (textarea) {
                          textarea.focus();
                        }
                      }}
                      className="w-full text-left p-2 text-xs text-gray-600 hover:bg-gray-200 rounded"
                    >
                      Focus Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          body: prev.body + '\n\n---\n\nBest regards,\n[Your Name]'
                        }));
                      }}
                      className="w-full text-left p-2 text-xs text-gray-600 hover:bg-gray-200 rounded"
                    >
                      Add Signature
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <Save className="h-4 w-4" />
                <span>Save Draft</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center space-x-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EnhancedComposeModal;
