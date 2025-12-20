const { Op } = require('sequelize');

class SmartScheduler {
  constructor() {
    this.workingDays = [1, 2, 3, 4, 5]; // Monday to Friday
    this.weekendDays = [0, 6]; // Sunday and Saturday
    this.defaultWorkingHours = { start: '09:00', end: '17:00' };
  }

  /**
   * Calculate next send date with smart scheduling
   * @param {Object} options - Scheduling options
   * @returns {Date} Next send date
   */
  calculateNextSendDate(options = {}) {
    const {
      interval = 7, // days
      skipWeekends = true,
      timezone = 'UTC',
      workingHours = this.defaultWorkingHours,
      startDate = new Date(),
      maxAttempts = 6,
      currentAttempt = 0
    } = options;

    let nextDate = new Date(startDate);
    
    // Add interval days
    nextDate.setDate(nextDate.getDate() + interval);
    
    // Apply smart scheduling rules
    if (skipWeekends) {
      nextDate = this.skipWeekends(nextDate);
    }
    
    // Apply working hours
    nextDate = this.applyWorkingHours(nextDate, workingHours);
    
    // Apply timezone
    nextDate = this.applyTimezone(nextDate, timezone);
    
    return nextDate;
  }

  /**
   * Skip weekends and move to next working day
   * @param {Date} date - Date to check
   * @returns {Date} Adjusted date
   */
  skipWeekends(date) {
    let adjustedDate = new Date(date);
    
    while (this.weekendDays.includes(adjustedDate.getDay())) {
      adjustedDate.setDate(adjustedDate.getDate() + 1);
    }
    
    return adjustedDate;
  }

  /**
   * Apply working hours to date
   * @param {Date} date - Date to adjust
   * @param {Object} workingHours - Working hours {start: '09:00', end: '17:00'}
   * @returns {Date} Adjusted date
   */
  applyWorkingHours(date, workingHours) {
    const adjustedDate = new Date(date);
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);
    
    // Set to start of working hours
    adjustedDate.setHours(startHour, startMinute, 0, 0);
    
    return adjustedDate;
  }

  /**
   * Apply timezone to date
   * @param {Date} date - Date to adjust
   * @param {string} timezone - Timezone
   * @returns {Date} Adjusted date
   */
  applyTimezone(date, timezone) {
    // For now, return the date as-is
    // In production, you would use a library like moment-timezone
    return date;
  }

  /**
   * Check if date is a working day
   * @param {Date} date - Date to check
   * @returns {boolean} Is working day
   */
  isWorkingDay(date) {
    const dayOfWeek = date.getDay();
    return this.workingDays.includes(dayOfWeek);
  }

  /**
   * Check if date is within working hours
   * @param {Date} date - Date to check
   * @param {Object} workingHours - Working hours
   * @returns {boolean} Is within working hours
   */
  isWithinWorkingHours(date, workingHours = this.defaultWorkingHours) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);
    
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;
    
    return timeInMinutes >= startTimeInMinutes && timeInMinutes <= endTimeInMinutes;
  }

  /**
   * Get next working day
   * @param {Date} date - Starting date
   * @returns {Date} Next working day
   */
  getNextWorkingDay(date) {
    let nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    while (!this.isWorkingDay(nextDay)) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    
    return nextDay;
  }

  /**
   * Get previous working day
   * @param {Date} date - Starting date
   * @returns {Date} Previous working day
   */
  getPreviousWorkingDay(date) {
    let prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    
    while (!this.isWorkingDay(prevDay)) {
      prevDay.setDate(prevDay.getDate() - 1);
    }
    
    return prevDay;
  }

  /**
   * Calculate optimal send time
   * @param {Object} options - Options
   * @returns {Date} Optimal send time
   */
  calculateOptimalSendTime(options = {}) {
    const {
      baseDate = new Date(),
      timezone = 'UTC',
      workingHours = this.defaultWorkingHours,
      skipWeekends = true,
      preferredTime = '10:00' // Default to 10 AM
    } = options;

    let optimalDate = new Date(baseDate);
    
    // Set preferred time
    const [preferredHour, preferredMinute] = preferredTime.split(':').map(Number);
    optimalDate.setHours(preferredHour, preferredMinute, 0, 0);
    
    // Skip weekends if enabled
    if (skipWeekends && !this.isWorkingDay(optimalDate)) {
      optimalDate = this.getNextWorkingDay(optimalDate);
    }
    
    // Ensure it's within working hours
    if (!this.isWithinWorkingHours(optimalDate, workingHours)) {
      optimalDate = this.applyWorkingHours(optimalDate, workingHours);
    }
    
    return optimalDate;
  }

  /**
   * Get schedule for multiple follow-ups
   * @param {Object} options - Options
   * @returns {Array} Array of scheduled dates
   */
  getFollowUpSchedule(options = {}) {
    const {
      startDate = new Date(),
      interval = 7,
      maxAttempts = 6,
      skipWeekends = true,
      timezone = 'UTC',
      workingHours = this.defaultWorkingHours
    } = options;

    const schedule = [];
    let currentDate = new Date(startDate);
    
    for (let i = 0; i < maxAttempts; i++) {
      const scheduledDate = this.calculateNextSendDate({
        interval,
        skipWeekends,
        timezone,
        workingHours,
        startDate: currentDate
      });
      
      schedule.push({
        attempt: i + 1,
        scheduledDate,
        isWorkingDay: this.isWorkingDay(scheduledDate),
        isWithinWorkingHours: this.isWithinWorkingHours(scheduledDate, workingHours)
      });
      
      currentDate = new Date(scheduledDate);
    }
    
    return schedule;
  }

  /**
   * Validate schedule
   * @param {Array} schedule - Schedule to validate
   * @returns {Object} Validation result
   */
  validateSchedule(schedule) {
    const issues = [];
    const warnings = [];
    
    for (let i = 0; i < schedule.length; i++) {
      const item = schedule[i];
      
      // Check for weekend scheduling
      if (!item.isWorkingDay) {
        issues.push(`Attempt ${item.attempt} scheduled on weekend: ${item.scheduledDate}`);
      }
      
      // Check for non-working hours
      if (!item.isWithinWorkingHours) {
        warnings.push(`Attempt ${item.attempt} scheduled outside working hours: ${item.scheduledDate}`);
      }
      
      // Check for too frequent scheduling
      if (i > 0) {
        const prevDate = new Date(schedule[i - 1].scheduledDate);
        const currentDate = new Date(item.scheduledDate);
        const daysDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff < 1) {
          issues.push(`Attempt ${item.attempt} scheduled too close to previous attempt: ${daysDiff} days`);
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      score: this.calculateScheduleScore(schedule)
    };
  }

  /**
   * Calculate schedule score
   * @param {Array} schedule - Schedule to score
   * @returns {number} Score (0-100)
   */
  calculateScheduleScore(schedule) {
    let score = 100;
    
    for (const item of schedule) {
      if (!item.isWorkingDay) score -= 20;
      if (!item.isWithinWorkingHours) score -= 10;
    }
    
    return Math.max(0, score);
  }

  /**
   * Optimize schedule
   * @param {Array} schedule - Schedule to optimize
   * @param {Object} options - Optimization options
   * @returns {Array} Optimized schedule
   */
  optimizeSchedule(schedule, options = {}) {
    const {
      workingHours = this.defaultWorkingHours,
      skipWeekends = true,
      preferredTime = '10:00'
    } = options;
    
    return schedule.map(item => {
      let optimizedDate = new Date(item.scheduledDate);
      
      // Skip weekends
      if (skipWeekends && !this.isWorkingDay(optimizedDate)) {
        optimizedDate = this.getNextWorkingDay(optimizedDate);
      }
      
      // Apply working hours
      optimizedDate = this.applyWorkingHours(optimizedDate, workingHours);
      
      return {
        ...item,
        scheduledDate: optimizedDate,
        isWorkingDay: this.isWorkingDay(optimizedDate),
        isWithinWorkingHours: this.isWithinWorkingHours(optimizedDate, workingHours)
      };
    });
  }

  /**
   * Get timezone-aware date
   * @param {Date} date - Date to convert
   * @param {string} fromTimezone - Source timezone
   * @param {string} toTimezone - Target timezone
   * @returns {Date} Converted date
   */
  getTimezoneAwareDate(date, fromTimezone = 'UTC', toTimezone = 'UTC') {
    // For now, return the date as-is
    // In production, you would use a library like moment-timezone
    return date;
  }

  /**
   * Get business days between dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} Business days
   */
  getBusinessDaysBetween(startDate, endDate) {
    let count = 0;
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      if (this.isWorkingDay(currentDate)) {
        count++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return count;
  }

  /**
   * Get next business day
   * @param {Date} date - Starting date
   * @param {number} days - Number of business days to add
   * @returns {Date} Next business day
   */
  getNextBusinessDay(date, days = 1) {
    let currentDate = new Date(date);
    let businessDaysAdded = 0;
    
    while (businessDaysAdded < days) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (this.isWorkingDay(currentDate)) {
        businessDaysAdded++;
      }
    }
    
    return currentDate;
  }
}

module.exports = SmartScheduler;
