import React, { useState } from 'react';
import { Download, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';

// Set up axios instance for file downloads
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

function BulkUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiClient.get('/api/clients/template/download', {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'client-upload-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert(error.response?.data?.error || 'Failed to download template');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiClient.post('/api/clients/bulk-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadResult(response.data.results);
      setSelectedFile(null);
      
      if (response.data.results.success > 0) {
        setTimeout(() => {
          window.location.href = '/clients';
        }, 3000);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadResult({
        success: 0,
        failed: 0,
        errors: [error.response?.data?.error || error.message]
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Bulk Client Upload
        </h1>
        <p className="text-gray-600 mb-8">
          Upload multiple clients at once using an Excel spreadsheet
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">How It Works</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                <li>Download the Excel template below.</li>
                <li>Fill in your client details (see the "Instructions" sheet in the template).</li>
                <li>Optionally select Conference, Status, and Stage for each client to control the email workflow.</li>
                <li>Upload the completed file.</li>
                <li>Automatic emails will start based on each client's Conference, Status, and Stage (Initial → Abstract → Registration).</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 1: Download Template
            </h2>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Excel Template
            </button>
            <p className="text-sm text-gray-500 mt-2">
              The template includes example data, dropdown options for Status / Stage / Conference, and a full Instructions sheet.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 2: Upload Completed File
            </h2>
            
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 bg-white border-2 border-gray-300 px-6 py-3 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <Upload className="w-5 h-5 text-gray-600" />
                <span className="text-gray-700">
                  {selectedFile ? selectedFile.name : 'Select Excel File'}
                </span>
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
                  className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload Clients
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {uploadResult && (
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Upload Results
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-green-700 bg-green-50 p-4 rounded-lg">
                  <CheckCircle className="w-6 h-6" />
                  <div>
                    <p className="font-semibold">{uploadResult.success} clients uploaded successfully</p>
                    {uploadResult.success > 0 && (
                      <p className="text-sm">Automatic email workflows have been started</p>
                    )}
                  </div>
                </div>

                {uploadResult.failed > 0 && (
                  <div className="flex items-start gap-3 text-red-700 bg-red-50 p-4 rounded-lg">
                    <XCircle className="w-6 h-6 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold mb-2">{uploadResult.failed} clients failed</p>
                      {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Errors:</p>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {uploadResult.errors.slice(0, 10).map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                            {uploadResult.errors.length > 10 && (
                              <li className="text-red-600">
                                ...and {uploadResult.errors.length - 10} more errors
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {uploadResult.success > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800 text-sm">
                      ✅ Redirecting to Clients page in 3 seconds...
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Workflow Guide</h3>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[180px]">Lead + stage1:</span>
              <span>
                Sends the Initial Email immediately, then continues with Abstract Submission follow-ups and finally Registration follow-ups (based on the conference settings).
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[180px]">Abstract Submitted + stage2:</span>
              <span>
                Skips the Initial and Abstract stages and sends only Registration emails.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[180px]">Registered + completed:</span>
              <span>No automated emails are sent.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BulkUpload;
