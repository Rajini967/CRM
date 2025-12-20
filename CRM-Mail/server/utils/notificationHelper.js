const { Notification } = require('../models');

/**
 * Notification Helper - Create notifications for various events
 */

class NotificationHelper {
  /**
   * Create a notification
   */
  static async createNotification({ userId, title, message, type, data = {}, priority = 'medium', link = null }) {
    try {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data,
        priority,
        link,
        isRead: false
      });

      console.log(`🔔 Notification created for user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  /**
   * Notify when client is assigned
   */
  static async notifyClientAssigned(userId, client, assignedByUser) {
    return await this.createNotification({
      userId,
      title: 'New Client Assigned',
      message: `${client.firstName} ${client.lastName} has been assigned to you by ${assignedByUser.name}`,
      type: 'client_added',
      data: {
        clientId: client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        clientEmail: client.email,
        assignedBy: assignedByUser.name
      },
      priority: 'medium',
      link: `/clients`
    });
  }

  /**
   * Notify when client status changes
   */
  static async notifyClientStatusChanged(userId, client, oldStatus, newStatus) {
    return await this.createNotification({
      userId,
      title: 'Client Status Updated',
      message: `${client.firstName} ${client.lastName} status changed from ${oldStatus} to ${newStatus}`,
      type: 'client_updated',
      data: {
        clientId: client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        oldStatus,
        newStatus
      },
      priority: newStatus === 'Registered' ? 'high' : 'low',
      link: `/clients`
    });
  }

  /**
   * Notify when conference is assigned
   */
  static async notifyConferenceAssigned(userId, conference, assignedByUser) {
    return await this.createNotification({
      userId,
      title: 'Conference Assigned',
      message: `You have been assigned to manage ${conference.name} by ${assignedByUser.name}`,
      type: 'conference_created',
      data: {
        conferenceId: conference.id,
        conferenceName: conference.name,
        assignedBy: assignedByUser.name
      },
      priority: 'high',
      link: `/conferences`
    });
  }

  /**
   * Notify when email bounces
   */
  static async notifyEmailBounced(userId, clientName, clientEmail) {
    return await this.createNotification({
      userId,
      title: 'Email Bounced',
      message: `Email to ${clientName} (${clientEmail}) bounced`,
      type: 'email_bounced',
      data: {
        clientName,
        clientEmail
      },
      priority: 'medium',
      link: `/email-logs`
    });
  }

  /**
   * Notify when follow-up is completed
   */
  static async notifyFollowUpCompleted(userId, client, stage) {
    return await this.createNotification({
      userId,
      title: 'Follow-up Sequence Completed',
      message: `Follow-up sequence for ${client.firstName} ${client.lastName} (${stage}) has completed`,
      type: 'follow_up_completed',
      data: {
        clientId: client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        stage
      },
      priority: 'low',
      link: `/clients`
    });
  }

  /**
   * System alert notification
   */
  static async notifySystemAlert(userId, title, message, priority = 'high') {
    return await this.createNotification({
      userId,
      title,
      message,
      type: 'system_alert',
      data: {},
      priority,
      link: null
    });
  }

  /**
   * Welcome notification for first login
   */
  static async notifyWelcome(userId, userName) {
    return await this.createNotification({
      userId,
      title: 'Welcome to Conference CRM!',
      message: `Hello ${userName}! Welcome to the Conference CRM system. Start by exploring conferences and adding clients.`,
      type: 'system_alert',
      data: {
        isWelcome: true
      },
      priority: 'medium',
      link: '/dashboard'
    });
  }

  /**
   * Notify when deadline is approaching
   */
  static async notifyDeadlineApproaching(userId, conferenceName, deadlineType, daysRemaining) {
    return await this.createNotification({
      userId,
      title: 'Deadline Approaching',
      message: `${deadlineType} deadline for ${conferenceName} is in ${daysRemaining} days`,
      type: 'system_alert',
      data: {
        conferenceName,
        deadlineType,
        daysRemaining
      },
      priority: daysRemaining <= 3 ? 'urgent' : 'high',
      link: '/conferences'
    });
  }

  /**
   * Bulk create notifications for multiple users
   */
  static async notifyMultipleUsers(userIds, title, message, type, data = {}, priority = 'medium') {
    try {
      const notifications = await Promise.all(
        userIds.map(userId => 
          this.createNotification({
            userId,
            title,
            message,
            type,
            data,
            priority
          })
        )
      );

      console.log(`🔔 Created ${notifications.length} bulk notifications`);
      return notifications;
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      return [];
    }
  }

  /**
   * Clear old read notifications (cleanup utility)
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const deleteResult = await Notification.update(
        { isActive: false },
        {
          where: {
            isRead: true,
            readAt: { [Op.lt]: cutoffDate }
          }
        }
      );

      console.log(`🧹 Cleaned up ${deleteResult[0]} old notifications`);
      return deleteResult[0];
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return 0;
    }
  }
}

module.exports = NotificationHelper;

