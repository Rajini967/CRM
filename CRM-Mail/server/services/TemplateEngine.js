const { EmailTemplate, Client, Conference, User, Organization } = require('../models');

class TemplateEngine {
  constructor() {
    // Support both single {var} and double {{var}} braces
    this.variablePattern = /\{\{([^}]+)\}\}|\{([^}]+)\}/g;
    this.conditionalPattern = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    this.loopPattern = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  }

  /**
   * Extract all variables from template content
   * @param {string} content - Template content
   * @returns {Array} Array of variable names
   */
  extractVariables(content) {
    const variables = new Set();
    let match;
    
    while ((match = this.variablePattern.exec(content)) !== null) {
      // Handle both {{var}} (match[1]) and {var} (match[2])
      const variable = (match[1] || match[2] || '').trim();
      if (variable) {
        variables.add(variable);
      }
    }
    
    return Array.from(variables);
  }

  /**
   * Get available variables for a template
   * @param {string} templateId - Template ID
   * @param {string} clientId - Client ID
   * @param {string} conferenceId - Conference ID
   * @returns {Object} Available variables
   */
  async getAvailableVariables(templateId, clientId, conferenceId) {
    try {
      const variables = {};
      
      // Helper function to format dates nicely
      const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      };

      // Get client data
      if (clientId) {
        const client = await Client.findByPk(clientId);
        
        if (client) {
          const fullName = (client.name || `${client.firstName || ''} ${client.lastName || ''}`).trim();
          const first = fullName.split(' ')[0] || '';
          const last = (() => { const p = fullName.split(' '); return p.length > 1 ? p.slice(1).join(' ') : ''; })();
          
          // Nested format (existing): client.firstName, client.email, etc.
          variables.client = {
            id: client.id,
            name: fullName,
            firstName: first,
            lastName: last,
            email: client.email || '',
            phone: client.phone || '',
            country: client.country || '',
            organization: client.organization || '',
            position: client.position || '',
            title: client.title || '',
            department: client.department || '',
            jobTitle: client.jobTitle || '',
            currentStage: client.currentStage || '',
            status: client.status || '',
            priority: client.priority || '',
            tags: client.tags || [],
            customFields: client.customFields || {}
          };

          // Simple format (UI uses this): name, firstName, email, etc.
          variables.name = fullName;
          variables.firstName = first;
          variables.lastName = last;
          variables.email = client.email || '';
          variables.phone = client.phone || '';
          variables.country = client.country || '';
          variables.organization = client.organization || '';
          variables.position = client.position || '';

          // Underscore format (migrations use this): client_name, client_email, etc.
          variables.client_name = fullName;
          variables.client_first_name = first;
          variables.client_last_name = last;
          variables.client_email = client.email || '';
          variables.client_phone = client.phone || '';
          variables.client_country = client.country || '';
          variables.client_organization = client.organization || '';
          variables.client_position = client.position || '';

          // Legacy/simple aliases to support older template syntax
          // e.g. {{clientName}} instead of {{name}} or {{client.name}}
          variables.clientName = fullName;
          variables.clientEmail = client.email || '';
          variables.clientCountry = client.country || '';
          variables.clientOrganization = client.organization || '';
        }
      }

      // Get conference data
      if (conferenceId) {
        const conference = await Conference.findByPk(conferenceId);
        
        if (conference) {
          const settings = conference.settings || {};
          const abstractSubmissionLink = settings.abstractSubmissionLink || settings.abstract_submission_link || conference.website || '';
          const registrationLink = settings.registrationLink || settings.registration_link || conference.website || '';
          const formattedStartDate = formatDate(conference.startDate);
          const formattedEndDate = formatDate(conference.endDate);
          const formattedAbstractDeadline = formatDate(conference.abstractDeadline);
          const formattedRegistrationDeadline = formatDate(conference.registrationDeadline);
          const dateRange = formattedStartDate && formattedEndDate 
            ? `${formattedStartDate} to ${formattedEndDate}` 
            : formattedStartDate || formattedEndDate || '';

          // Nested format (existing): conference.name, conference.venue, etc.
          variables.conference = {
            id: conference.id,
            name: conference.name || '',
            shortName: conference.shortName || '',
            venue: conference.venue || '',
            startDate: formattedStartDate,
            endDate: formattedEndDate,
            dateRange: dateRange,
            description: conference.description || '',
            website: conference.website || '',
            abstractSubmissionLink,
            registrationLink,
            abstractDeadline: formattedAbstractDeadline,
            registrationDeadline: formattedRegistrationDeadline,
            currency: conference.currency || 'USD',
            status: conference.status || '',
            location: conference.location || {},
            contactInfo: conference.contactInfo || {},
            primaryContact: conference.primaryContact || '',
            assignedTeamLead: conference.assignedTeamLead || '',
            organization: conference.organization || ''
          };

          // Simple format (UI uses this): conferenceName, conferenceVenue, etc.
          variables.conferenceName = conference.name || '';
          variables.conferenceShortName = conference.shortName || '';
          variables.conferenceVenue = conference.venue || '';
          variables.conferenceDate = dateRange;
          variables.conferenceStartDate = formattedStartDate;
          variables.conferenceEndDate = formattedEndDate;
          variables.abstractDeadline = formattedAbstractDeadline;
          variables.registrationDeadline = formattedRegistrationDeadline;
          variables.conferenceWebsite = conference.website || '';
          variables.conferenceDescription = conference.description || '';
          variables.conferenceAbstractSubmissionLink = abstractSubmissionLink;
          variables.conferenceRegistrationLink = registrationLink;

          // Underscore format (migrations use this): conference_name, conference_venue, etc.
          variables.conference_name = conference.name || '';
          variables.conference_short_name = conference.shortName || '';
          variables.conference_venue = conference.venue || '';
          variables.conference_date = dateRange;
          variables.conference_start_date = formattedStartDate;
          variables.conference_end_date = formattedEndDate;
          variables.abstract_deadline = formattedAbstractDeadline;
          variables.registration_deadline = formattedRegistrationDeadline;
          variables.conference_website = conference.website || '';
          variables.conference_description = conference.description || '';
          variables.conference_abstract_submission_link = abstractSubmissionLink;
          variables.conference_registration_link = registrationLink;

          // Direct accessors for backward compatibility
          variables.abstractSubmissionLink = abstractSubmissionLink;
          variables.registrationLink = registrationLink;

          // Legacy/simple aliases to support older template syntax
          // e.g. {{startDate}}, {{endDate}}, {{venue}} used in existing templates
          variables.startDate = formattedStartDate;
          variables.endDate = formattedEndDate;
          variables.venue = conference.venue || '';
        }
      }

      // Add system variables
      variables.system = {
        currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        currentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
        currentDay: new Date().getDate(),
        timezone: 'UTC'
      };

      // Add top-level system variables
      variables.currentDate = variables.system.currentDate;
      variables.currentYear = variables.system.currentYear;

      // Add organization data
      if (variables.client?.organization) {
        variables.organization = variables.client.organization;
      } else if (variables.conference?.organization) {
        variables.organization = variables.conference.organization;
      }

      return variables;
    } catch (error) {
      console.error('Error getting available variables:', error);
      return {};
    }
  }

  /**
   * Render template with variables
   * @param {string} templateId - Template ID
   * @param {string} clientId - Client ID
   * @param {string} conferenceId - Conference ID
   * @returns {Object} Rendered template
   */
  async renderTemplate(templateId, clientId, conferenceId) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const variables = await this.getAvailableVariables(templateId, clientId, conferenceId);
      
      const renderedTemplate = {
        id: template.id,
        name: template.name,
        stage: template.stage,
        subject: this.renderContent(template.subject, variables),
        bodyHtml: this.renderContent(template.bodyHtml, variables),
        bodyText: this.renderContent(template.bodyText, variables),
        variables: this.extractVariables(template.bodyHtml + template.bodyText),
        attachments: template.attachments || []
      };

      return renderedTemplate;
    } catch (error) {
      console.error('Error rendering template:', error);
      throw error;
    }
  }

  /**
   * Render content with variables
   * @param {string} content - Content to render
   * @param {Object} variables - Variables to substitute
   * @returns {string} Rendered content
   */
  renderContent(content, variables) {
    if (!content) return '';

    let rendered = content;

    // Replace simple variables - handles both {{var}} and {var}
    rendered = rendered.replace(this.variablePattern, (match, doubleVar, singleVar) => {
      // The regex captures either {{var}} (doubleVar) or {var} (singleVar)
      const variable = (doubleVar || singleVar || '').trim();
      if (!variable) return match;

      const value = this.getVariableValue(variable, variables);
      return value !== undefined && value !== null && value !== '' ? value : match;
    });

    // Handle conditional statements
    rendered = rendered.replace(this.conditionalPattern, (match, condition, content) => {
      const conditionResult = this.evaluateCondition(condition, variables);
      return conditionResult ? content : '';
    });

    // Handle loops
    rendered = rendered.replace(this.loopPattern, (match, arrayPath, content) => {
      const array = this.getVariableValue(arrayPath.trim(), variables);
      if (Array.isArray(array)) {
        return array.map(item => this.renderContent(content, { ...variables, item })).join('');
      }
      return '';
    });

    return rendered;
  }

  /**
   * Get variable value from nested object
   * @param {string} path - Variable path (e.g., 'client.name')
   * @param {Object} variables - Variables object
   * @returns {*} Variable value
   */
  getVariableValue(path, variables) {
    const keys = path.split('.');
    let value = variables;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Evaluate condition for conditional statements
   * @param {string} condition - Condition to evaluate
   * @param {Object} variables - Variables object
   * @returns {boolean} Condition result
   */
  evaluateCondition(condition, variables) {
    // Simple condition evaluation
    // Supports: variable, variable == value, variable != value
    const trimmedCondition = condition.trim();
    
    if (trimmedCondition.includes('==')) {
      const [left, right] = trimmedCondition.split('==').map(s => s.trim());
      const leftValue = this.getVariableValue(left, variables);
      const rightValue = this.getVariableValue(right, variables) || right.replace(/['"]/g, '');
      return leftValue == rightValue;
    }
    
    if (trimmedCondition.includes('!=')) {
      const [left, right] = trimmedCondition.split('!=').map(s => s.trim());
      const leftValue = this.getVariableValue(left, variables);
      const rightValue = this.getVariableValue(right, variables) || right.replace(/['"]/g, '');
      return leftValue != rightValue;
    }
    
    // Simple truthy check
    const value = this.getVariableValue(trimmedCondition, variables);
    return Boolean(value);
  }

  /**
   * Validate template variables
   * @param {string} templateId - Template ID
   * @param {Object} variables - Variables to validate
   * @returns {Object} Validation result
   */
  async validateTemplateVariables(templateId, variables) {
    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template) {
        return { valid: false, error: 'Template not found' };
      }

      const requiredVariables = this.extractVariables(template.bodyHtml + template.bodyText);
      const missingVariables = [];
      const availableVariables = Object.keys(variables);

      for (const variable of requiredVariables) {
        if (!availableVariables.includes(variable.split('.')[0])) {
          missingVariables.push(variable);
        }
      }

      return {
        valid: missingVariables.length === 0,
        missingVariables,
        requiredVariables,
        availableVariables
      };
    } catch (error) {
      console.error('Error validating template variables:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Preview template with sample data
   * @param {string} templateId - Template ID
   * @param {Object} sampleData - Sample data for preview
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
          website: 'https://example.com',
          abstractSubmissionLink: 'https://abstracts.example.com',
          registrationLink: 'https://register.example.com'
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
        subject: this.renderContent(template.subject, variables),
        bodyHtml: this.renderContent(template.bodyHtml, variables),
        bodyText: this.renderContent(template.bodyText, variables),
        variables: this.extractVariables(template.bodyHtml + template.bodyText)
      };
    } catch (error) {
      console.error('Error previewing template:', error);
      throw error;
    }
  }
}

module.exports = TemplateEngine;
