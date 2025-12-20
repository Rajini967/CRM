const { Client, Conference, EmailTemplate } = require('../models');

/**
 * Template renderer utility
 * Handles variable replacement in email templates
 */
class TemplateRenderer {
  constructor() {
    this.variablePattern = /\{\{([^}]+)\}\}/g;
  }

  /**
   * Render template with client and conference data
   * @param {string} templateString - Template string with variables
   * @param {Object} clientData - Client information
   * @param {Object} conferenceData - Conference information
   * @param {Object} customVars - Custom variables
   * @returns {Object} - Rendered subject and body
   */
  async renderTemplate(templateString, clientData, conferenceData, customVars = {}) {
    try {
      // Merge all variables
      const variables = {
        ...this.getClientVariables(clientData),
        ...this.getConferenceVariables(conferenceData),
        ...customVars,
        ...this.getSystemVariables()
      };

      // Replace variables in template
      const rendered = templateString.replace(this.variablePattern, (match, variable) => {
        const cleanVar = variable.trim();
        return variables[cleanVar] || match;
      });

      return rendered;
    } catch (error) {
      console.error('Template rendering error:', error);
      throw new Error('Failed to render template');
    }
  }

  /**
   * Render template by ID with client and conference data
   * @param {string} templateId - Template ID
   * @param {string} clientId - Client ID
   * @param {string} conferenceId - Conference ID
   * @param {Object} customVars - Custom variables
   * @returns {Object} - Rendered subject and body
   */
  async renderTemplateById(templateId, clientId, conferenceId, customVars = {}) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const client = await Client.findByPk(clientId, {
        include: [
          { model: Conference, as: 'conference' }
        ]
      });

      if (!client) {
        throw new Error('Client not found');
      }

      const conference = await Conference.findByPk(conferenceId);
      if (!conference) {
        throw new Error('Conference not found');
      }

      const renderedSubject = await this.renderTemplate(
        template.subject,
        client,
        conference,
        customVars
      );

      const renderedBody = await this.renderTemplate(
        template.bodyHtml || template.bodyText,
        client,
        conference,
        customVars
      );

      return {
        subject: renderedSubject,
        bodyHtml: renderedBody,
        bodyText: this.htmlToText(renderedBody),
        template: template
      };
    } catch (error) {
      console.error('Template rendering by ID error:', error);
      throw error;
    }
  }

  /**
   * Get client-specific variables
   * @param {Object} client - Client data
   * @returns {Object} - Client variables
   */
  getClientVariables(client) {
    if (!client) return {};

    return {
      'client_name': client.name || client.firstName + ' ' + client.lastName,
      'client_first_name': client.firstName || client.name?.split(' ')[0] || '',
      'client_last_name': client.lastName || client.name?.split(' ').slice(1).join(' ') || '',
      'client_email': client.email || '',
      'client_phone': client.phone || '',
      'client_company': client.company || '',
      'client_position': client.position || '',
      'client_country': client.country || '',
      'client_status': client.status || '',
      'client_notes': client.notes || ''
    };
  }

  /**
   * Get conference-specific variables
   * @param {Object} conference - Conference data
   * @returns {Object} - Conference variables
   */
  getConferenceVariables(conference) {
    if (!conference) return {};

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    return {
      'conference_name': conference.name || '',
      'conference_short_name': conference.shortName || '',
      'conference_venue': conference.venue || '',
      'conference_date': formatDate(conference.startDate),
      'conference_start_date': formatDate(conference.startDate),
      'conference_end_date': formatDate(conference.endDate),
      'conference_website': conference.website || '',
      'conference_description': conference.description || '',
      'abstract_deadline': formatDate(conference.abstractDeadline),
      'registration_deadline': formatDate(conference.registrationDeadline),
      'conference_currency': conference.currency || 'USD'
    };
  }

  /**
   * Get system variables
   * @returns {Object} - System variables
   */
  getSystemVariables() {
    const now = new Date();
    
    return {
      'current_date': now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      'current_time': now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      'current_year': now.getFullYear().toString(),
      'unsubscribe_link': `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?token={{unsubscribe_token}}`,
      'registration_link': `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?conference={{conference_id}}&client={{client_id}}`,
      'abstract_submission_link': `${process.env.FRONTEND_URL || 'http://localhost:3000'}/submit-abstract?conference={{conference_id}}&client={{client_id}}`
    };
  }

  /**
   * Validate template variables against schema
   * @param {string} templateString - Template string
   * @param {Object} varsSchema - Variable schema
   * @returns {Object} - Validation result
   */
  validateTemplate(templateString, varsSchema) {
    const requiredVars = varsSchema.required || [];
    const foundVars = [];
    let match;

    while ((match = this.variablePattern.exec(templateString)) !== null) {
      foundVars.push(match[1].trim());
    }

    const missingVars = requiredVars.filter(varName => !foundVars.includes(varName));
    const extraVars = foundVars.filter(varName => 
      !requiredVars.includes(varName) && 
      !this.isSystemVariable(varName)
    );

    return {
      isValid: missingVars.length === 0,
      missingVars,
      extraVars,
      foundVars: [...new Set(foundVars)]
    };
  }

  /**
   * Check if variable is a system variable
   * @param {string} varName - Variable name
   * @returns {boolean} - Is system variable
   */
  isSystemVariable(varName) {
    const systemVars = [
      'current_date', 'current_time', 'current_year',
      'unsubscribe_link', 'registration_link', 'abstract_submission_link'
    ];
    return systemVars.includes(varName);
  }

  /**
   * Convert HTML to plain text
   * @param {string} html - HTML string
   * @returns {string} - Plain text
   */
  htmlToText(html) {
    if (!html) return '';
    
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Extract all variables from template
   * @param {string} templateString - Template string
   * @returns {Array} - Array of variable names
   */
  extractVariables(templateString) {
    const variables = [];
    let match;

    while ((match = this.variablePattern.exec(templateString)) !== null) {
      variables.push(match[1].trim());
    }

    return [...new Set(variables)];
  }

  /**
   * Preview template with sample data
   * @param {string} templateString - Template string
   * @param {Object} sampleData - Sample data for preview
   * @returns {Object} - Preview result
   */
  previewTemplate(templateString, sampleData = {}) {
    const defaultSampleData = {
      'client_name': 'John Doe',
      'client_email': 'john.doe@example.com',
      'client_company': 'Acme Corp',
      'conference_name': 'Tech Conference 2024',
      'conference_short_name': 'TC24',
      'conference_venue': 'Convention Center',
      'conference_date': 'June 15, 2024',
      'abstract_deadline': 'May 15, 2024',
      'registration_deadline': 'June 1, 2024',
      'current_date': new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };

    const variables = { ...defaultSampleData, ...sampleData };
    const rendered = templateString.replace(this.variablePattern, (match, variable) => {
      const cleanVar = variable.trim();
      return variables[cleanVar] || match;
    });

    return {
      original: templateString,
      rendered,
      variables: this.extractVariables(templateString),
      sampleData: variables
    };
  }
}

module.exports = new TemplateRenderer();
