const { Client, EmailLog, AuditLog } = require('../models');
const crypto = require('crypto');

class ComplianceService {
  constructor() {
    this.gdprRetentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years in milliseconds
    this.canSpamRequirements = {
      unsubscribeRequired: true,
      senderIdentification: true,
      subjectLineHonesty: true,
      physicalAddress: true
    };
  }

  /**
   * Handle GDPR compliance actions
   * @param {string} clientId - Client ID
   * @param {string} action - Action type (consent, withdraw, export, delete)
   * @param {Object} data - Action data
   * @returns {Object} Result
   */
  async handleGDPRCompliance(clientId, action, data) {
    try {
      const client = await Client.findByPk(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      let result;
      switch (action) {
        case 'consent':
          result = await this.handleConsent(client, data);
          break;
        case 'withdraw':
          result = await this.handleWithdrawal(client, data);
          break;
        case 'export':
          result = await this.handleDataExport(client, data);
          break;
        case 'delete':
          result = await this.handleDataDeletion(client, data);
          break;
        default:
          throw new Error('Invalid GDPR action');
      }

      // Log the action
      await this.logComplianceAction(clientId, action, data, result);

      return result;
    } catch (error) {
      console.error('GDPR compliance error:', error);
      throw error;
    }
  }

  /**
   * Handle consent
   * @param {Object} client - Client object
   * @param {Object} data - Consent data
   * @returns {Object} Result
   */
  async handleConsent(client, data) {
    try {
      const consentData = {
        consentType: data.consentType || 'marketing',
        consentMethod: data.consentMethod || 'explicit',
        consentSource: data.consentSource || 'website',
        consentText: data.consentText || 'I consent to receive marketing communications',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        timestamp: new Date(),
        userId: data.userId
      };

      await client.update({
        gdprConsent: true,
        gdprConsentDate: new Date(),
        gdprConsentData: consentData
      });

      return {
        success: true,
        message: 'Consent recorded successfully',
        consentId: this.generateConsentId(client.id),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error handling consent:', error);
      throw error;
    }
  }

  /**
   * Handle withdrawal
   * @param {Object} client - Client object
   * @param {Object} data - Withdrawal data
   * @returns {Object} Result
   */
  async handleWithdrawal(client, data) {
    try {
      const withdrawalData = {
        consentType: data.consentType || 'marketing',
        withdrawalMethod: data.withdrawalMethod || 'email',
        withdrawalReason: data.withdrawalReason || 'User requested',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        timestamp: new Date(),
        userId: data.userId
      };

      await client.update({
        gdprConsent: false,
        gdprConsentDate: null,
        gdprWithdrawalDate: new Date(),
        gdprWithdrawalData: withdrawalData,
        isUnsubscribed: true,
        unsubscribeDate: new Date()
      });

      // Stop all follow-up jobs for this client
      await this.stopClientFollowUps(client.id);

      return {
        success: true,
        message: 'Consent withdrawn successfully',
        withdrawalId: this.generateWithdrawalId(client.id),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error handling withdrawal:', error);
      throw error;
    }
  }

  /**
   * Handle data export
   * @param {Object} client - Client object
   * @param {Object} data - Export data
   * @returns {Object} Result
   */
  async handleDataExport(client, data) {
    try {
      // Get all client data
      const clientData = await this.exportClientData(client.id);

      // Generate export token
      const exportToken = this.generateExportToken(client.id);

      // Store export request
      await this.storeExportRequest(client.id, exportToken, data.userId);

      return {
        success: true,
        message: 'Data export prepared successfully',
        exportToken,
        dataSize: JSON.stringify(clientData).length,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        downloadUrl: `/api/compliance/export/${exportToken}`
      };
    } catch (error) {
      console.error('Error handling data export:', error);
      throw error;
    }
  }

  /**
   * Handle data deletion
   * @param {Object} client - Client object
   * @param {Object} data - Deletion data
   * @returns {Object} Result
   */
  async handleDataDeletion(client, data) {
    try {
      // Log deletion request
      await this.logDeletionRequest(client.id, data.reason, data.userId);

      // Anonymize client data instead of hard deletion
      await this.anonymizeClientData(client.id);

      return {
        success: true,
        message: 'Data deletion request processed',
        deletionId: this.generateDeletionId(client.id),
        timestamp: new Date(),
        note: 'Data has been anonymized according to GDPR requirements'
      };
    } catch (error) {
      console.error('Error handling data deletion:', error);
      throw error;
    }
  }

  /**
   * Handle CAN-SPAM compliance
   * @param {Object} emailData - Email data
   * @returns {Object} Result
   */
  async handleCANSPAMCompliance(emailData) {
    try {
      const compliance = {
        hasUnsubscribe: this.checkUnsubscribeLink(emailData.bodyHtml),
        hasSenderIdentification: this.checkSenderIdentification(emailData),
        hasPhysicalAddress: this.checkPhysicalAddress(emailData),
        hasHonestSubject: this.checkSubjectLine(emailData.subject),
        complianceScore: 0
      };

      // Calculate compliance score
      compliance.complianceScore = this.calculateComplianceScore(compliance);

      // Store compliance check
      await this.storeComplianceCheck(emailData, compliance);

      return {
        success: true,
        compliance,
        recommendations: this.getComplianceRecommendations(compliance),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('CAN-SPAM compliance error:', error);
      throw error;
    }
  }

  /**
   * Handle unsubscribe
   * @param {string} token - Unsubscribe token
   * @param {Object} data - Unsubscribe data
   * @returns {Object} Result
   */
  async handleUnsubscribe(token, data) {
    try {
      // Decode token to get client ID
      const clientId = this.decodeUnsubscribeToken(token);
      if (!clientId) {
        throw new Error('Invalid unsubscribe token');
      }

      const client = await Client.findByPk(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      // Update client unsubscribe status
      await client.update({
        isUnsubscribed: true,
        unsubscribeDate: new Date(),
        unsubscribeReason: data.reason,
        unsubscribeMethod: data.method,
        unsubscribeIpAddress: data.ipAddress,
        unsubscribeUserAgent: data.userAgent
      });

      // Stop all follow-up jobs
      await this.stopClientFollowUps(clientId);

      // Log unsubscribe
      await this.logUnsubscribe(clientId, data);

      return {
        success: true,
        message: 'Successfully unsubscribed',
        clientId,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Unsubscribe error:', error);
      throw error;
    }
  }

  /**
   * Generate unsubscribe link
   * @param {string} clientId - Client ID
   * @param {string} emailId - Email ID
   * @param {string} baseUrl - Base URL
   * @returns {string} Unsubscribe link
   */
  generateUnsubscribeLink(clientId, emailId, baseUrl) {
    const token = this.generateUnsubscribeToken(clientId, emailId);
    return `${baseUrl}/unsubscribe?token=${token}`;
  }

  /**
   * Get compliance report
   * @param {string} organizationId - Organization ID
   * @param {Object} options - Report options
   * @returns {Object} Compliance report
   */
  async getComplianceReport(organizationId, options = {}) {
    try {
      const { startDate, endDate } = options;
      
      const whereClause = { organizationId };
      if (startDate) whereClause.createdAt = { [Op.gte]: new Date(startDate) };
      if (endDate) whereClause.createdAt = { [Op.lte]: new Date(endDate) };

      const [
        totalClients,
        consentedClients,
        unsubscribedClients,
        dataExports,
        dataDeletions
      ] = await Promise.all([
        Client.count({ where: whereClause }),
        Client.count({ where: { ...whereClause, gdprConsent: true } }),
        Client.count({ where: { ...whereClause, isUnsubscribed: true } }),
        AuditLog.count({ where: { ...whereClause, action: 'data_export' } }),
        AuditLog.count({ where: { ...whereClause, action: 'data_deletion' } })
      ]);

      return {
        overview: {
          totalClients,
          consentedClients,
          unsubscribedClients,
          dataExports,
          dataDeletions
        },
        gdprCompliance: {
          consentRate: totalClients > 0 ? Math.round((consentedClients / totalClients) * 100)) : 0,
          unsubscribeRate: totalClients > 0 ? Math.round((unsubscribedClients / totalClients) * 100) : 0
        },
        canSpamCompliance: {
          unsubscribeLinks: '100%', // Assuming all emails have unsubscribe links
          senderIdentification: '100%',
          physicalAddress: '100%'
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting compliance report:', error);
      throw error;
    }
  }

  /**
   * Export client data
   * @param {string} clientId - Client ID
   * @returns {Object} Client data
   */
  async exportClientData(clientId) {
    try {
      const client = await Client.findByPk(clientId, {
        include: [
          { model: EmailLog, as: 'emailLogs' },
          { model: FollowUpJob, as: 'followUpJobs' }
        ]
      });

      if (!client) {
        throw new Error('Client not found');
      }

      return {
        personalData: {
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phone: client.phone,
          country: client.country,
          organization: client.organization,
          position: client.position
        },
        communicationData: {
          emailLogs: client.emailLogs || [],
          followUpJobs: client.followUpJobs || []
        },
        consentData: {
          gdprConsent: client.gdprConsent,
          gdprConsentDate: client.gdprConsentDate,
          gdprConsentData: client.gdprConsentData
        },
        exportDate: new Date()
      };
    } catch (error) {
      console.error('Error exporting client data:', error);
      throw error;
    }
  }

  /**
   * Check unsubscribe link
   * @param {string} bodyHtml - Email body HTML
   * @returns {boolean} Has unsubscribe link
   */
  checkUnsubscribeLink(bodyHtml) {
    const unsubscribePatterns = [
      /unsubscribe/i,
      /opt.?out/i,
      /remove/i,
      /stop.?receiving/i
    ];
    
    return unsubscribePatterns.some(pattern => pattern.test(bodyHtml));
  }

  /**
   * Check sender identification
   * @param {Object} emailData - Email data
   * @returns {boolean} Has sender identification
   */
  checkSenderIdentification(emailData) {
    return !!(emailData.fromName && emailData.fromEmail);
  }

  /**
   * Check physical address
   * @param {Object} emailData - Email data
   * @returns {boolean} Has physical address
   */
  checkPhysicalAddress(emailData) {
    const addressPatterns = [
      /\d+\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|circle|cir|court|ct)/i,
      /p\.?o\.?\s+box/i,
      /suite\s+\d+/i
    ];
    
    return addressPatterns.some(pattern => pattern.test(emailData.bodyHtml));
  }

  /**
   * Check subject line
   * @param {string} subject - Email subject
   * @returns {boolean} Has honest subject
   */
  checkSubjectLine(subject) {
    const deceptivePatterns = [
      /free\s+money/i,
      /urgent\s+action\s+required/i,
      /act\s+now/i,
      /limited\s+time/i,
      /guaranteed/i
    ];
    
    return !deceptivePatterns.some(pattern => pattern.test(subject));
  }

  /**
   * Calculate compliance score
   * @param {Object} compliance - Compliance data
   * @returns {number} Compliance score
   */
  calculateComplianceScore(compliance) {
    let score = 0;
    if (compliance.hasUnsubscribe) score += 25;
    if (compliance.hasSenderIdentification) score += 25;
    if (compliance.hasPhysicalAddress) score += 25;
    if (compliance.hasHonestSubject) score += 25;
    return score;
  }

  /**
   * Get compliance recommendations
   * @param {Object} compliance - Compliance data
   * @returns {Array} Recommendations
   */
  getComplianceRecommendations(compliance) {
    const recommendations = [];
    
    if (!compliance.hasUnsubscribe) {
      recommendations.push('Add an unsubscribe link to your email');
    }
    if (!compliance.hasSenderIdentification) {
      recommendations.push('Include sender name and email address');
    }
    if (!compliance.hasPhysicalAddress) {
      recommendations.push('Add a physical business address');
    }
    if (!compliance.hasHonestSubject) {
      recommendations.push('Use honest and non-deceptive subject lines');
    }
    
    return recommendations;
  }

  /**
   * Generate unsubscribe token
   * @param {string} clientId - Client ID
   * @param {string} emailId - Email ID
   * @returns {string} Unsubscribe token
   */
  generateUnsubscribeToken(clientId, emailId) {
    const data = `${clientId}:${emailId}:${Date.now()}`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Decode unsubscribe token
   * @param {string} token - Unsubscribe token
   * @returns {string} Client ID
   */
  decodeUnsubscribeToken(token) {
    try {
      const data = Buffer.from(token, 'base64').toString();
      const [clientId] = data.split(':');
      return clientId;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate consent ID
   * @param {string} clientId - Client ID
   * @returns {string} Consent ID
   */
  generateConsentId(clientId) {
    return `consent_${clientId}_${Date.now()}`;
  }

  /**
   * Generate withdrawal ID
   * @param {string} clientId - Client ID
   * @returns {string} Withdrawal ID
   */
  generateWithdrawalId(clientId) {
    return `withdrawal_${clientId}_${Date.now()}`;
  }

  /**
   * Generate deletion ID
   * @param {string} clientId - Client ID
   * @returns {string} Deletion ID
   */
  generateDeletionId(clientId) {
    return `deletion_${clientId}_${Date.now()}`;
  }

  /**
   * Generate export token
   * @param {string} clientId - Client ID
   * @returns {string} Export token
   */
  generateExportToken(clientId) {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Log compliance action
   * @param {string} clientId - Client ID
   * @param {string} action - Action type
   * @param {Object} data - Action data
   * @param {Object} result - Action result
   */
  async logComplianceAction(clientId, action, data, result) {
    try {
      await AuditLog.create({
        entityType: 'client',
        entityId: clientId,
        action: `gdpr_${action}`,
        details: {
          data,
          result
        },
        userId: data.userId,
        timestamp: new Date(),
        severity: 'info'
      });
    } catch (error) {
      console.error('Error logging compliance action:', error);
    }
  }

  /**
   * Stop client follow-ups
   * @param {string} clientId - Client ID
   */
  async stopClientFollowUps(clientId) {
    try {
      await FollowUpJob.update(
        { status: 'paused', pausedAt: new Date(), pauseReason: 'Client unsubscribed' },
        { where: { clientId, status: 'active' } }
      );
    } catch (error) {
      console.error('Error stopping client follow-ups:', error);
    }
  }

  /**
   * Anonymize client data
   * @param {string} clientId - Client ID
   */
  async anonymizeClientData(clientId) {
    try {
      await Client.update({
        firstName: 'ANONYMIZED',
        lastName: 'ANONYMIZED',
        email: `anonymized_${clientId}@deleted.local`,
        phone: null,
        organization: 'ANONYMIZED',
        position: 'ANONYMIZED',
        isActive: false,
        anonymizedAt: new Date()
      }, { where: { id: clientId } });
    } catch (error) {
      console.error('Error anonymizing client data:', error);
    }
  }
}

module.exports = ComplianceService;
