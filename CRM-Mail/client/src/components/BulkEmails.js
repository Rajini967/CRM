import React, { useState, useRef, useMemo } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Upload,
  Download,
  Send,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  File,
  Mail,
  FileText
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Set up axios instance
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Quill modules configuration (simplified version from Templates)
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean']
  ]
};

const quillFormats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'list',
  'bullet',
  'align',
  'link'
];

const stripHtml = (html) => {
  if (!html) return '';
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').trim();
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
};

function BulkEmails() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [emailAccountId, setEmailAccountId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch email accounts
  const { data: emailAccounts = [], isLoading: emailAccountsLoading } = useQuery(
    'email-accounts',
    async () => {
      const response = await apiClient.get('/api/email-accounts');
      return response.data;
    }
  );

  // Filter active SMTP accounts
  const activeEmailAccounts = useMemo(() => {
    return emailAccounts.filter(account => account.type === 'smtp' || account.type === 'both');
  }, [emailAccounts]);

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery(
    'templates',
    async () => {
      const response = await apiClient.get('/api/templates');
      return response.data;
    }
  );

  // Filter active templates
  const activeTemplates = useMemo(() => {
    return templates.filter(template => template.isActive !== false);
  }, [templates]);

  // Handle template selection
  const handleTemplateChange = (e) => {
    const selectedTemplateId = e.target.value;
    setTemplateId(selectedTemplateId);
    
    if (selectedTemplateId) {
      const template = activeTemplates.find(t => t.id === selectedTemplateId);
      if (template) {
        setSubject(template.subject || '');
        setBodyHtml(template.bodyHtml || '');
      }
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Validate file
  const validateAndSetFile = (file) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      toast.error('Please select an Excel (.xlsx, .xls) or CSV (.csv) file');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setResults(null);
    toast.success('File selected successfully');
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setResults(null);
  };

  // Reset form for next batch
  const handleResetForm = () => {
    setSelectedFile(null);
    setSubject('');
    setBodyHtml('');
    setResults(null);
    setTemplateId(''); // Reset template selection too
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    toast.success('Form reset. Ready to send another batch!');
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await apiClient.get('/api/bulk-emails/template', {
        responseType: 'blob'
      });

      // Check if response is actually an error (JSON error response)
      if (response.data.type && response.data.type.includes('application/json')) {
        // Response is JSON error, not blob
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        toast.error(errorData.error || errorData.details || 'Failed to download template');
        return;
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk-email-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      console.error('Error response:', error.response);
      
      // Try to extract error message from blob response if it's an error
      if (error.response?.data && error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          toast.error(errorData.error || errorData.details || 'Failed to download template');
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          toast.error(`Failed to download template: ${error.response?.status || 'Unknown error'}`);
        }
      } else if (error.response?.data) {
        // Regular JSON error response
        toast.error(error.response.data.error || error.response.data.details || 'Failed to download template');
      } else {
        toast.error(error.message || 'Failed to download template. Please check your connection and try again.');
      }
    }
  };

  // Send bulk emails
  const handleSendBulkEmails = async () => {
    // Validation
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    if (!emailAccountId) {
      toast.error('Please select an email account');
      return;
    }

    if (!subject || !subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    const bodyText = stripHtml(bodyHtml);
    if (!bodyText || !bodyText.trim()) {
      toast.error('Please enter email body');
      return;
    }

    setSending(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('emailAccountId', emailAccountId);
      formData.append('subject', subject);
      formData.append('bodyHtml', bodyHtml);
      formData.append('bodyText', bodyText);
      if (templateId) {
        formData.append('templateId', templateId);
      }

      const response = await apiClient.post('/api/bulk-emails/send', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResults(response.data);
      
      if (response.data.success > 0) {
        toast.success(`Successfully sent ${response.data.success} email(s)`);
      }
      
      if (response.data.failed > 0) {
        toast.error(`${response.data.failed} email(s) failed to send`);
      }
    } catch (error) {
      console.error('Error sending bulk emails:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send bulk emails';
      toast.error(errorMessage);
      
      setResults({
        success: 0,
        failed: 0,
        total: 0,
        errors: [errorMessage]
      });
    } finally {
      setSending(false);
    }
  };

  // Check if send button should be disabled
  const isSendDisabled = !selectedFile || !emailAccountId || !subject.trim() || !stripHtml(bodyHtml).trim() || sending;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Bulk Emails
        </h1>
        <p className="text-gray-600 mb-8">
          Upload a file with recipient email addresses and send bulk emails to all recipients
        </p>

        {/* Instructions Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">File Format Requirements</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                <li><strong>Required column:</strong> "Email" (case-insensitive)</li>
                <li><strong>Optional columns:</strong> Any other columns can be used as template variables (e.g., Name, Company, CustomField1)</li>
                <li><strong>Template variables:</strong> Use {`{ColumnName}`} format in subject and body (e.g., {`{Name}`}, {`{Email}`}, {`{Company}`})</li>
                <li><strong>First row:</strong> Must contain headers</li>
                <li><strong>Supported formats:</strong> Excel (.xlsx, .xls) or CSV (.csv)</li>
                <li><strong>File size limit:</strong> 10MB</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Step 1: Download Template */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 1: Download Template (Optional)
            </h2>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Excel Template
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Download a sample template with the correct format and example data.
            </p>
          </div>

          {/* Step 2: File Upload */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 2: Upload Recipient File
            </h2>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700 font-medium mb-2">
                  {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                </p>
                <p className="text-sm text-gray-500">
                  Excel (.xlsx, .xls) or CSV (.csv) up to 10MB
                </p>
              </label>
            </div>

            {selectedFile && (
              <div className="mt-4 flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <File className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="text-red-500 hover:text-red-700"
                  title="Remove file"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Email Configuration */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 3: Configure Email
            </h2>

            <div className="space-y-4">
              {/* Email Account */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Account <span className="text-red-500">*</span>
                </label>
                <select
                  value={emailAccountId}
                  onChange={(e) => setEmailAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={emailAccountsLoading}
                >
                  <option value="">Select Email Account</option>
                  {activeEmailAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name || account.email} ({account.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template (Optional)
                </label>
                <select
                  value={templateId}
                  onChange={handleTemplateChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={templatesLoading}
                >
                  <option value="">Select Template (Optional)</option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Selecting a template will auto-fill the subject and body
                </p>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Use {Name}, {Email} for template variables"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Body <span className="text-red-500">*</span>
                </label>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <ReactQuill
                    value={bodyHtml}
                    onChange={setBodyHtml}
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Use {Name}, {Email}, {CustomField1} for template variables"
                    theme="snow"
                    style={{ minHeight: '200px' }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {`{Email}`}, {`{Name}`}, and any column names from your file
                </p>
              </div>
            </div>
          </div>

          {/* Step 4: Send */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 4: Send Bulk Emails
            </h2>
            <button
              onClick={handleSendBulkEmails}
              disabled={isSendDisabled}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                isSendDisabled
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Bulk Emails
                </>
              )}
            </button>
          </div>

          {/* Results Display */}
          {results && (
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Send Results
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">Success</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 mt-2">
                      {results.success}
                    </p>
                  </div>

                  {results.failed > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-red-700">
                        <XCircle className="w-5 h-5" />
                        <span className="font-semibold">Failed</span>
                      </div>
                      <p className="text-2xl font-bold text-red-700 mt-2">
                        {results.failed}
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Mail className="w-5 h-5" />
                      <span className="font-semibold">Total</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 mt-2">
                      {results.total}
                    </p>
                  </div>
                </div>

                {results.errors && results.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-semibold text-red-900 mb-2">Errors:</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-red-800 max-h-60 overflow-y-auto">
                      {results.errors.slice(0, 50).map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                      {results.errors.length > 50 && (
                        <li className="text-red-600">
                          ...and {results.errors.length - 50} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Send Another Batch Button */}
                {results.success > 0 && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleResetForm}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      Send Another Batch
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BulkEmails;

