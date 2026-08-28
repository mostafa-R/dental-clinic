import { logError } from './logger.js';

/**
 * Enhanced error monitoring and alerting system
 * Tracks error patterns, rates, and sends alerts for critical issues
 */
class ErrorMonitor {
  constructor() {
    this.errors = new Map();
    this.alerts = new Map();
    this.alertThresholds = {
      errorRate: 10, // errors per minute
      consecutiveErrors: 5,
      criticalErrorTypes: ['DatabaseError', 'RedisError', 'AuthenticationError']
    };
    this.slackWebhook = process.env.SLACK_SECURITY_WEBHOOK;
    this.alertEmail = process.env.SECURITY_ALERT_EMAIL;
  }

  /**
   * Track an error with context
   */
  trackError(error, context = {}) {
    const errorKey = error.name || 'UnknownError';
    const timestamp = new Date();
    const minuteKey = `${timestamp.getFullYear()}-${timestamp.getMonth() + 1}-${timestamp.getDate()} ${timestamp.getHours()}:${timestamp.getMinutes()}`;
    
    // Track error counts
    let errorStats = this.errors.get(errorKey);
    if (!errorStats) {
      errorStats = {
        count: 0,
        lastOccurred: null,
        contexts: [],
        minuteCounts: new Map()
      };
      this.errors.set(errorKey, errorStats);
    }
    
    errorStats.count++;
    errorStats.lastOccurred = timestamp;
    errorStats.contexts.push({
      timestamp,
      message: error.message,
      stack: error.stack,
      ...context
    });
    
    // Keep only last 100 contexts
    if (errorStats.contexts.length > 100) {
      errorStats.contexts = errorStats.contexts.slice(-100);
    }
    
    // Track minute-level counts for rate calculation
    const minuteCount = errorStats.minuteCounts.get(minuteKey) || 0;
    errorStats.minuteCounts.set(minuteKey, minuteCount + 1);
    
    // Clean up old minute counts (keep last 60 minutes)
    const sixtyMinutesAgo = new Date(timestamp.getTime() - 60 * 60 * 1000);
    const oldMinuteKey = `${sixtyMinutesAgo.getFullYear()}-${sixtyMinutesAgo.getMonth() + 1}-${sixtyMinutesAgo.getDate()} ${sixtyMinutesAgo.getHours()}:${sixtyMinutesAgo.getMinutes()}`;
    
    for (const [key] of errorStats.minuteCounts) {
      if (key < oldMinuteKey) {
        errorStats.minuteCounts.delete(key);
      }
    }
    
    // Check for alerts
    this.checkForAlerts(errorKey, errorStats, context);
    
    return errorStats;
  }

  /**
   * Check if an error pattern triggers an alert
   */
  checkForAlerts(errorKey, errorStats, context) {
    const recentMinutes = Array.from(errorStats.minuteCounts.values());
    const recentCount = recentMinutes.reduce((sum, count) => sum + count, 0);
    const errorRate = recentCount / Math.max(recentMinutes.length, 1);
    
    // Check error rate threshold
    if (errorRate > this.alertThresholds.errorRate) {
      this.triggerAlert('high_error_rate', {
        errorKey,
        errorRate: Math.round(errorRate * 100) / 100,
        threshold: this.alertThresholds.errorRate,
        recentCount,
        context
      });
    }
    
    // Check for critical error types
    if (this.alertThresholds.criticalErrorTypes.includes(errorKey)) {
      this.triggerAlert('critical_error', {
        errorKey,
        message: context.message || 'Critical system error',
        context
      });
    }
    
    // Check for consecutive errors
    const recentErrors = errorStats.contexts.slice(-this.alertThresholds.consecutiveErrors);
    if (recentErrors.length >= this.alertThresholds.consecutiveErrors) {
      const timeDiff = recentErrors[recentErrors.length - 1].timestamp - recentErrors[0].timestamp;
      const timeWindowMinutes = timeDiff / (1000 * 60);
      
      if (timeWindowMinutes < 5) { // 5 consecutive errors within 5 minutes
        this.triggerAlert('consecutive_errors', {
          errorKey,
          count: recentErrors.length,
          timeWindowMinutes: Math.round(timeWindowMinutes * 100) / 100,
          context
        });
      }
    }
  }

  /**
   * Trigger an alert
   */
  triggerAlert(alertType, data) {
    const alertKey = `${alertType}:${data.errorKey}:${new Date().toISOString().slice(0, 16)}`;
    
    // Prevent duplicate alerts within the same minute
    if (this.alerts.has(alertKey)) {
      return;
    }
    
    this.alerts.set(alertKey, {
      type: alertType,
      timestamp: new Date(),
      data
    });
    
    // Log the alert
    logError(new Error(`ALERT: ${alertType} - ${data.errorKey}`), {
      alertType,
      ...data,
      alertTimestamp: new Date().toISOString()
    });
    
    // Send external alerts if configured
    this.sendExternalAlerts(alertType, data);
  }

  /**
   * Send alerts to external systems (Slack, Email, etc.)
   */
  sendExternalAlerts(alertType, data) {
    const alertMessage = this.formatAlertMessage(alertType, data);
    
    // Send to Slack if configured
    if (this.slackWebhook) {
      this.sendSlackAlert(alertMessage, alertType, data);
    }
    
    // Send email if configured
    if (this.alertEmail) {
      this.sendEmailAlert(alertMessage, alertType, data);
    }
  }

  /**
   * Format alert message
   */
  formatAlertMessage(alertType, data) {
    const timestamp = new Date().toISOString();
    const env = process.env.NODE_ENV || 'development';
    
    switch (alertType) {
      case 'high_error_rate':
        return `🚨 HIGH ERROR RATE ALERT\n` +
               `Environment: ${env}\n` +
               `Error Type: ${data.errorKey}\n` +
               `Error Rate: ${data.errorRate}/min (threshold: ${data.threshold}/min)\n` +
               `Recent Errors: ${data.recentCount}\n` +
               `Timestamp: ${timestamp}\n` +
               `URL: ${data.context?.url || 'N/A'}`;
        
      case 'critical_error':
        return `🔴 CRITICAL ERROR ALERT\n` +
               `Environment: ${env}\n` +
               `Error Type: ${data.errorKey}\n` +
               `Message: ${data.message}\n` +
               `Timestamp: ${timestamp}\n` +
               `IP: ${data.context?.ip || 'N/A'}\n` +
               `User: ${data.context?.userId || 'N/A'}`;
        
      case 'consecutive_errors':
        return `⚠️ CONSECUTIVE ERROR ALERT\n` +
               `Environment: ${env}\n` +
               `Error Type: ${data.errorKey}\n` +
               `Count: ${data.count} errors\n` +
               `Time Window: ${data.timeWindowMinutes} minutes\n` +
               `Timestamp: ${timestamp}`;
        
      default:
        return `⚠️ SYSTEM ALERT\n` +
               `Environment: ${env}\n` +
               `Type: ${alertType}\n` +
               `Data: ${JSON.stringify(data, null, 2)}\n` +
               `Timestamp: ${timestamp}`;
    }
  }

  /**
   * Send alert to Slack
   */
  async sendSlackAlert(message, alertType, data) {
    try {
      const payload = {
        text: message,
        attachments: [{
          color: alertType === 'critical_error' ? 'danger' : 'warning',
          fields: [
            {
              title: 'Environment',
              value: process.env.NODE_ENV || 'development',
              short: true
            },
            {
              title: 'Error Type',
              value: data.errorKey,
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }]
      };
      
      // In a real implementation, you would make an HTTP request to Slack
      // For now, we'll log it
      console.log('[Slack Alert]', JSON.stringify(payload, null, 2));
      
    } catch (error) {
      console.error('Failed to send Slack alert:', error.message);
    }
  }

  /**
   * Send alert email
   */
  async sendEmailAlert(message, alertType, data) {
    try {
      // In a real implementation, you would use nodemailer or similar
      // For now, we'll log it
      console.log('[Email Alert]', message);
      
    } catch (error) {
      console.error('Failed to send email alert:', error.message);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = [];
    let totalErrors = 0;
    
    for (const [errorKey, errorStats] of this.errors) {
      const recentMinutes = Array.from(errorStats.minuteCounts.values());
      const recentCount = recentMinutes.reduce((sum, count) => sum + count, 0);
      const errorRate = recentCount / Math.max(recentMinutes.length, 1);
      
      stats.push({
        errorKey,
        totalCount: errorStats.count,
        recentCount,
        errorRate: Math.round(errorRate * 100) / 100,
        lastOccurred: errorStats.lastOccurred,
        sampleMessages: errorStats.contexts.slice(-3).map(ctx => ctx.message)
      });
      
      totalErrors += errorStats.count;
    }
    
    // Sort by error rate (highest first)
    stats.sort((a, b) => b.errorRate - a.errorRate);
    
    return {
      errors: stats,
      summary: {
        totalErrors,
        uniqueErrorTypes: stats.length,
        activeAlerts: this.alerts.size,
        monitoringEnabled: true
      },
      alerts: Array.from(this.alerts.values()).slice(-10) // Last 10 alerts
    };
  }

  /**
   * Reset error statistics
   */
  resetStats() {
    this.errors.clear();
    this.alerts.clear();
  }
}

// Create singleton instance
const errorMonitor = new ErrorMonitor();

/**
 * Middleware to monitor errors
 */
export function errorMonitoringMiddleware(err, req, res, next) {
  if (err) {
    errorMonitor.trackError(err, {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id,
      statusCode: err.statusCode || 500,
      userAgent: req.get('user-agent')
    });
  }
  
  next(err);
}

/**
 * Get error monitoring statistics endpoint
 */
export function getErrorMonitoringStats() {
  return errorMonitor.getErrorStats();
}

/**
 * Reset error monitoring statistics
 */
export function resetErrorMonitoring() {
  errorMonitor.resetStats();
}

export default errorMonitor;