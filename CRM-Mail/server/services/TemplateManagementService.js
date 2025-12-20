const { EmailTemplate } = require('../models');
const TemplateEngine = require('./TemplateEngine');

class TemplateManagementService {
  constructor() {
    this.templateEngine = new TemplateEngine();
    this.validStages = new Set(['abstract_submission', 'registration']);
  }

  /**
   * Create template
   * @param {Object} templateData - Template data
   * @returns {Object} Created template
   */
  async createTemplate(templateData) {
    try {
      const {
        organizationId,
        name,
        subject,
        bodyHtml,
        bodyText,
        stage,
        category,
        variables,
        attachments
      } = templateData;

      // Validate required fields
      if (!name || !subject || !bodyHtml || !bodyText) {
        throw new Error('Missing required fields: name, subject, bodyHtml, bodyText');
      }

      // Validate stage
      const resolvedStage = stage || 'abstract_submission';
      if (!this.validStages.has(resolvedStage)) {
        throw new Error('Stage must be abstract_submission or registration');
      }

      // Extract variables from template content
      const extractedVariables = this.templateEngine.extractVariables(bodyHtml + bodyText);
      const templateVariables = variables || extractedVariables;

      // Create template
      const template = await EmailTemplate.create({
        organizationId,
        name,
        subject,
        bodyHtml,
        bodyText,
        stage: resolvedStage,
        category: category || 'standard',
        variables: templateVariables,
        attachments: attachments || null,
        isActive: true,
        createdBy: templateData.userId
      });

      return template;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Get templates
   * @param {string} organizationId - Organization ID
   * @param {Object} filters - Filter options
   * @returns {Array} Templates
   */
  async getTemplates(organizationId, filters = {}) {
    try {
      const whereClause = { organizationId };
      
      if (filters.stage) {
        whereClause.stage = filters.stage;
      }
      
      if (filters.category) {
        whereClause.category = filters.category;
      }
      
      if (filters.isActive !== undefined) {
        whereClause.isActive = filters.isActive;
      }

      const templates = await EmailTemplate.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']]
      });

      return templates;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Render template
   * @param {string} templateId - Template ID
   * @param {Object} data - Template data
   * @returns {Object} Rendered template
   */
  async renderTemplate(templateId, data) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const rendered = await this.templateEngine.renderContent(template.bodyHtml, data);
      const renderedText = await this.templateEngine.renderContent(template.bodyText, data);
      const renderedSubject = await this.templateEngine.renderContent(template.subject, data);

      return {
        id: template.id,
        name: template.name,
        subject: renderedSubject,
        bodyHtml: rendered,
        bodyText: renderedText,
        variables: this.templateEngine.extractVariables(template.bodyHtml + template.bodyText),
        attachments: template.attachments
      };
    } catch (error) {
      console.error('Error rendering template:', error);
      throw error;
    }
  }

  /**
   * Preview template
   * @param {string} templateId - Template ID
   * @param {Object} sampleData - Sample data
   * @returns {Object} Preview result
   */
  async previewTemplate(templateId, sampleData = {}) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const defaultSampleData = {
        client: {
          name: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          organization: 'Example Corp',
          country: 'United States'
        },
        conference: {
          name: 'Sample Conference 2024',
          shortName: 'SC24',
          venue: 'Convention Center',
          startDate: '2024-06-15',
          endDate: '2024-06-17',
          website: 'https://example.com'
        },
        organization: {
          name: 'Sample Organization',
          domain: 'example.com'
        },
        system: {
          currentDate: new Date().toLocaleDateString(),
          currentTime: new Date().toLocaleTimeString()
        }
      };

      const variables = { ...defaultSampleData, ...sampleData };
      
      return {
        subject: this.templateEngine.renderContent(template.subject, variables),
        bodyHtml: this.templateEngine.renderContent(template.bodyHtml, variables),
        bodyText: this.templateEngine.renderContent(template.bodyText, variables),
        variables: this.templateEngine.extractVariables(template.bodyHtml + template.bodyText)
      };
    } catch (error) {
      console.error('Error previewing template:', error);
      throw error;
    }
  }

  /**
   * Get template variables
   * @param {string} templateId - Template ID
   * @returns {Array} Template variables
   */
  async getTemplateVariables(templateId) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const variables = this.templateEngine.extractVariables(template.bodyHtml + template.bodyText);
      
      return {
        templateId,
        variables,
        availableVariables: await this.getAvailableVariables(),
        usage: this.getVariableUsage(template.bodyHtml + template.bodyText, variables)
      };
    } catch (error) {
      console.error('Error getting template variables:', error);
      throw error;
    }
  }

  /**
   * Get available variables
   * @returns {Object} Available variables
   */
  async getAvailableVariables() {
    return {
      client: [
        'client.name',
        'client.firstName',
        'client.lastName',
        'client.email',
        'client.phone',
        'client.country',
        'client.organization',
        'client.position',
        'client.status',
        'client.currentStage'
      ],
      conference: [
        'conference.name',
        'conference.shortName',
        'conference.venue',
        'conference.startDate',
        'conference.endDate',
        'conference.description',
        'conference.website',
        'conference.abstractDeadline',
        'conference.registrationDeadline'
      ],
      organization: [
        'organization.name',
        'organization.domain',
        'organization.contactInfo'
      ],
      system: [
        'system.currentDate',
        'system.currentTime',
        'system.currentYear',
        'system.currentMonth',
        'system.currentDay'
      ]
    };
  }

  /**
   * Get variable usage
   * @param {string} content - Template content
   * @param {Array} variables - Variables array
   * @returns {Object} Variable usage
   */
  getVariableUsage(content, variables) {
    const usage = {};
    
    variables.forEach(variable => {
      const pattern = new RegExp(`\\{\\{${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
      const matches = content.match(pattern);
      usage[variable] = matches ? matches.length : 0;
    });
    
    return usage;
  }

  /**
   * Validate template
   * @param {Object} templateData - Template data
   * @returns {Object} Validation result
   */
  validateTemplate(templateData) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!templateData.name) {
      errors.push('Template name is required');
    }
    
    if (!templateData.subject) {
      errors.push('Subject is required');
    }
    
    if (!templateData.bodyHtml) {
      errors.push('HTML body is required');
    }
    
    if (!templateData.bodyText) {
      errors.push('Text body is required');
    }

    // Check subject length
    if (templateData.subject && templateData.subject.length > 78) {
      warnings.push('Subject line is longer than recommended (78 characters)');
    }

    // Check for unsubscribe link
    if (templateData.bodyHtml && !this.hasUnsubscribeLink(templateData.bodyHtml)) {
      warnings.push('No unsubscribe link found in HTML body');
    }

    // Check for variables
    const variables = this.templateEngine.extractVariables(templateData.bodyHtml + templateData.bodyText);
    if (variables.length === 0) {
      warnings.push('No variables found in template');
    }

    // Check for broken variables
    const brokenVariables = this.findBrokenVariables(templateData.bodyHtml + templateData.bodyText);
    if (brokenVariables.length > 0) {
      errors.push(`Broken variables found: ${brokenVariables.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      variables,
      score: this.calculateTemplateScore(templateData)
    };
  }

  /**
   * Check for unsubscribe link
   * @param {string} bodyHtml - HTML body
   * @returns {boolean} Has unsubscribe link
   */
  hasUnsubscribeLink(bodyHtml) {
    const unsubscribePatterns = [
      /unsubscribe/i,
      /opt.?out/i,
      /remove/i,
      /stop.?receiving/i
    ];
    
    return unsubscribePatterns.some(pattern => pattern.test(bodyHtml));
  }

  /**
   * Find broken variables
   * @param {string} content - Template content
   * @returns {Array} Broken variables
   */
  findBrokenVariables(content) {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;
    
    while ((match = variablePattern.exec(content)) !== null) {
      variables.push(match[1]);
    }
    
    const brokenVariables = [];
    variables.forEach(variable => {
      if (variable.includes('{{') || variable.includes('}}')) {
        brokenVariables.push(variable);
      }
    });
    
    return brokenVariables;
  }

  /**
   * Calculate template score
   * @param {Object} templateData - Template data
   * @returns {number} Template score
   */
  calculateTemplateScore(templateData) {
    let score = 0;
    
    // Required fields (40 points)
    if (templateData.name) score += 10;
    if (templateData.subject) score += 10;
    if (templateData.bodyHtml) score += 10;
    if (templateData.bodyText) score += 10;
    
    // Best practices (60 points)
    if (templateData.subject && templateData.subject.length <= 78) score += 10;
    if (this.hasUnsubscribeLink(templateData.bodyHtml)) score += 10;
    if (templateData.bodyHtml && templateData.bodyHtml.includes('<!DOCTYPE html>')) score += 10;
    if (templateData.bodyHtml && templateData.bodyHtml.includes('<html>')) score += 10;
    if (templateData.bodyHtml && templateData.bodyHtml.includes('<body>')) score += 10;
    if (templateData.bodyHtml && templateData.bodyHtml.includes('</body>')) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * Duplicate template
   * @param {string} templateId - Template ID
   * @param {string} newName - New template name
   * @returns {Object} Duplicated template
   */
  async duplicateTemplate(templateId, newName) {
    try {
      const originalTemplate = await EmailTemplate.findByPk(templateId);
      if (!originalTemplate) {
        throw new Error('Template not found');
      }

      const duplicatedTemplate = await EmailTemplate.create({
        organizationId: originalTemplate.organizationId,
        name: newName,
        subject: originalTemplate.subject,
        bodyHtml: originalTemplate.bodyHtml,
        bodyText: originalTemplate.bodyText,
        stage: originalTemplate.stage,
        category: originalTemplate.category,
        variables: originalTemplate.variables,
        attachments: originalTemplate.attachments,
        isActive: true,
        createdBy: originalTemplate.createdBy
      });

      return duplicatedTemplate;
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw error;
    }
  }

  /**
   * Get template statistics
   * @param {string} templateId - Template ID
   * @returns {Object} Template statistics
   */
  async getTemplateStatistics(templateId) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Get usage statistics
      const emailLogs = await EmailLog.findAll({
        where: { templateId },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });

      const totalUsage = emailLogs.reduce((sum, log) => sum + parseInt(log.count), 0);
      const sentCount = emailLogs.find(log => log.status === 'sent')?.count || 0;
      const openedCount = emailLogs.find(log => log.status === 'opened')?.count || 0;
      const clickedCount = emailLogs.find(log => log.status === 'clicked')?.count || 0;

      return {
        templateId,
        name: template.name,
        totalUsage,
        sentCount,
        openedCount,
        clickedCount,
        openRate: sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0,
        clickRate: sentCount > 0 ? Math.round((clickedCount / sentCount) * 100) : 0,
        lastUsed: template.updatedAt,
        createdAt: template.createdAt
      };
    } catch (error) {
      console.error('Error getting template statistics:', error);
      throw error;
    }
  }
}

module.exports = TemplateManagementService;