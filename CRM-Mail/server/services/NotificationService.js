const { User, Notification } = require('../models');
const { Op } = require('sequelize');

class NotificationService {
  constructor() {
    this.notificationTypes = {
      EMAIL_SENT: 'email_sent',
      EMAIL_BOUNCED: 'email_bounced',
      CLIENT_ADDED: 'client_added',
      CLIENT_UPDATED: 'client_updated',
      CONFERENCE_CREATED: 'conference_created',
      FOLLOW_UP_COMPLETED: 'follow_up_completed',
      SYSTEM_ALERT: 'system_alert',
      USER_ACTIVITY: 'user_activity'
    };

    this.priorityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      URGENT: 'urgent'
    };
  }

  /**
   * Send notification
   * @param {string} userId - User ID
   * @param {Object} notificationData - Notification data
   * @returns {Object} Notification result
   */
  async sendNotification(userId, notificationData) {
    try {
      const {
        type,
        title,
        message,
        data = {},
        priority = 'medium',
        sendEmail = false
      } = notificationData;

      // Validate user
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create notification
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        data,
        priority,
        isRead: false,
        sendEmail,
        createdAt: new Date()
      });

      // Send email if requested
      if (sendEmail) {
        await this.sendNotificationEmail(user, notification);
      }

      // Send real-time notification
      await this.sendRealTimeNotification(userId, notification);

      return {
        success: true,
        notificationId: notification.id,
        message: 'Notification sent successfully'
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Array} Notifications
   */
  async getUserNotifications(userId, filters = {}) {
    try {
      const whereClause = { userId };
      
      if (filters.type) {
        whereClause.type = filters.type;
      }
      
      if (filters.priority) {
        whereClause.priority = filters.priority;
      }
      
      if (filters.isRead !== undefined) {
        whereClause.isRead = filters.isRead;
      }

      const limit = filters.limit ? parseInt(filters.limit) : 50;

      const notifications = await Notification.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit
      });

      return notifications;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   * @returns {Object} Result
   */
  async markNotificationAsRead(userId, notificationId) {
    try {
      const notification = await Notification.findOne({
        where: { id: notificationId, userId }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.update({
        isRead: true,
        readAt: new Date()
      });

      return {
        success: true,
        message: 'Notification marked as read'
      };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   * @param {string} userId - User ID
   * @returns {Object} Result
   */
  async markAllNotificationsAsRead(userId) {
    try {
      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { userId, isRead: false } }
      );

      return {
        success: true,
        message: 'All notifications marked as read'
      };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   * @param {string} userId - User ID
   * @returns {Object} Notification statistics
   */
  async getNotificationStatistics(userId) {
    try {
      const [
        totalNotifications,
        unreadNotifications,
        notificationsByType,
        notificationsByPriority
      ] = await Promise.all([
        Notification.count({ where: { userId } }),
        Notification.count({ where: { userId, isRead: false } }),
        Notification.findAll({
          where: { userId },
          attributes: [
            'type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['type']
        }),
        Notification.findAll({
          where: { userId },
          attributes: [
            'priority',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['priority']
        })
      ]);

      return {
        total: totalNotifications,
        unread: unreadNotifications,
        read: totalNotifications - unreadNotifications,
        byType: notificationsByType,
        byPriority: notificationsByPriority,
        unreadPercentage: totalNotifications > 0 ? Math.round((unreadNotifications / totalNotifications) * 100) : 0
      };
    } catch (error) {
      console.error('Error getting notification statistics:', error);
      throw error;
    }
  }

  /**
   * Send notification email
   * @param {Object} user - User object
   * @param {Object} notification - Notification object
   */
  async sendNotificationEmail(user, notification) {
    try {
      // This would integrate with your email service
      // For now, just log the email
      console.log(`📧 Notification email sent to ${user.email}: ${notification.title}`);
      
      // In a real implementation, you would:
      // 1. Get the user's email preferences
      // 2. Render the email template
      // 3. Send via SMTP
      // 4. Log the email send
    } catch (error) {
      console.error('Error sending notification email:', error);
    }
  }

  /**
   * Send real-time notification
   * @param {string} userId - User ID
   * @param {Object} notification - Notification object
   */
  async sendRealTimeNotification(userId, notification) {
    try {
      // This would integrate with WebSocket or Server-Sent Events
      // For now, just log the real-time notification
      console.log(`🔔 Real-time notification sent to user ${userId}: ${notification.title}`);
      
      // In a real implementation, you would:
      // 1. Get the user's active connections
      // 2. Send via WebSocket
      // 3. Handle connection errors
    } catch (error) {
      console.error('Error sending real-time notification:', error);
    }
  }

  /**
   * Create system notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {Object} data - Additional data
   * @param {string} priority - Priority level
   */
  async createSystemNotification(title, message, data = {}, priority = 'medium') {
    try {
      // Get all active users
      const users = await User.findAll({
        where: { isActive: true }
      });

      // Send notification to all users
      const notifications = await Promise.all(
        users.map(user => 
          this.sendNotification(user.id, {
            type: this.notificationTypes.SYSTEM_ALERT,
            title,
            message,
            data,
            priority,
            sendEmail: priority === 'urgent' || priority === 'high'
          })
        )
      );

      return {
        success: true,
        sentTo: users.length,
        notifications
      };
    } catch (error) {
      console.error('Error creating system notification:', error);
      throw error;
    }
  }

  /**
   * Create user activity notification
   * @param {string} userId - User ID
   * @param {string} activity - Activity description
   * @param {Object} data - Activity data
   */
  async createUserActivityNotification(userId, activity, data = {}) {
    try {
      return await this.sendNotification(userId, {
        type: this.notificationTypes.USER_ACTIVITY,
        title: 'Activity Update',
        message: activity,
        data,
        priority: 'low'
      });
    } catch (error) {
      console.error('Error creating user activity notification:', error);
      throw error;
    }
  }

  /**
   * Create email notification
   * @param {string} userId - User ID
   * @param {string} emailType - Email type
   * @param {Object} emailData - Email data
   */
  async createEmailNotification(userId, emailType, emailData) {
    try {
      const notificationType = emailType === 'bounced' ? 
        this.notificationTypes.EMAIL_BOUNCED : 
        this.notificationTypes.EMAIL_SENT;

      return await this.sendNotification(userId, {
        type: notificationType,
        title: `Email ${emailType === 'bounced' ? 'Bounced' : 'Sent'}`,
        message: `Email ${emailType === 'bounced' ? 'bounced' : 'sent'} to ${emailData.recipient}`,
        data: emailData,
        priority: emailType === 'bounced' ? 'high' : 'medium'
      });
    } catch (error) {
      console.error('Error creating email notification:', error);
      throw error;
    }
  }

  /**
   * Create client notification
   * @param {string} userId - User ID
   * @param {string} clientAction - Client action
   * @param {Object} clientData - Client data
   */
  async createClientNotification(userId, clientAction, clientData) {
    try {
      const notificationType = clientAction === 'added' ? 
        this.notificationTypes.CLIENT_ADDED : 
        this.notificationTypes.CLIENT_UPDATED;

      return await this.sendNotification(userId, {
        type: notificationType,
        title: `Client ${clientAction === 'added' ? 'Added' : 'Updated'}`,
        message: `Client ${clientData.firstName} ${clientData.lastName} ${clientAction}`,
        data: clientData,
        priority: 'medium'
      });
    } catch (error) {
      console.error('Error creating client notification:', error);
      throw error;
    }
  }

  /**
   * Create conference notification
   * @param {string} userId - User ID
   * @param {Object} conferenceData - Conference data
   */
  async createConferenceNotification(userId, conferenceData) {
    try {
      return await this.sendNotification(userId, {
        type: this.notificationTypes.CONFERENCE_CREATED,
        title: 'New Conference Created',
        message: `Conference ${conferenceData.name} has been created`,
        data: conferenceData,
        priority: 'medium'
      });
    } catch (error) {
      console.error('Error creating conference notification:', error);
      throw error;
    }
  }

  /**
   * Create follow-up notification
   * @param {string} userId - User ID
   * @param {Object} followUpData - Follow-up data
   */
  async createFollowUpNotification(userId, followUpData) {
    try {
      return await this.sendNotification(userId, {
        type: this.notificationTypes.FOLLOW_UP_COMPLETED,
        title: 'Follow-up Completed',
        message: `Follow-up for ${followUpData.clientName} has been completed`,
        data: followUpData,
        priority: 'low'
      });
    } catch (error) {
      console.error('Error creating follow-up notification:', error);
      throw error;
    }
  }

  /**
   * Clean up old notifications
   * @param {number} daysOld - Days old threshold
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const deletedCount = await Notification.destroy({
        where: {
          createdAt: { [Op.lt]: cutoffDate },
          isRead: true
        }
      });

      return {
        success: true,
        deletedCount,
        message: `Cleaned up ${deletedCount} old notifications`
      };
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification preferences
   * @param {string} userId - User ID
   * @returns {Object} Notification preferences
   */
  async getNotificationPreferences(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      return user.settings?.notifications || {
        email: true,
        dashboard: true,
        reports: true,
        systemAlerts: true,
        userActivity: false
      };
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Object} Result
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        notifications: {
          ...currentSettings.notifications,
          ...preferences
        }
      };

      await user.update({ settings: updatedSettings });

      return {
        success: true,
        message: 'Notification preferences updated successfully'
      };
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;