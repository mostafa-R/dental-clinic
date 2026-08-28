import mongoose from 'mongoose';
import { getRedisInfo } from '../config/redis.js';
import { getPerfStats } from './perfMonitor.js';
import { getDbStats } from './dbMonitor.js';
import { getErrorMonitoringStats } from './errorMonitor.js';

/**
 * Comprehensive health monitoring system
 * Checks all critical system components and provides detailed status
 */
export async function getSystemHealth() {
  const checks = [];
  let overallStatus = 'healthy';
  let criticalFailures = 0;
  
  // 1. Database Health Check
  const dbHealth = await checkDatabase();
  checks.push(dbHealth);
  if (dbHealth.status === 'unhealthy') criticalFailures++;
  
  // 2. Redis Health Check
  const redisHealth = await checkRedis();
  checks.push(redisHealth);
  if (redisHealth.status === 'unhealthy') criticalFailures++;
  
  // 3. Memory Usage Check
  const memoryHealth = checkMemory();
  checks.push(memoryHealth);
  if (memoryHealth.status === 'unhealthy') criticalFailures++;
  
  // 4. Disk Space Check (simulated - in production would check actual disk)
  const diskHealth = checkDiskSpace();
  checks.push(diskHealth);
  if (diskHealth.status === 'unhealthy') criticalFailures++;
  
  // 5. External Services Check
  const externalHealth = await checkExternalServices();
  checks.push(...externalHealth);
  criticalFailures += externalHealth.filter(h => h.status === 'unhealthy').length;
  
  // 6. Performance Metrics
  const performanceHealth = checkPerformance();
  checks.push(performanceHealth);
  
  // 7. Error Rate Check
  const errorHealth = checkErrorRates();
  checks.push(errorHealth);
  if (errorHealth.status === 'unhealthy') criticalFailures++;
  
  // Determine overall status
  if (criticalFailures > 0) {
    overallStatus = 'unhealthy';
  } else if (checks.some(check => check.status === 'degraded')) {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      totalChecks: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      criticalFailures
    }
  };
}

/**
 * Database health check
 */
async function checkDatabase() {
  try {
    const startTime = Date.now();
    
    // Check connection state
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    // Perform a simple query to verify responsiveness
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - startTime;
    
    // Get database statistics
    const stats = await mongoose.connection.db.stats();
    
    return {
      component: 'database',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      details: {
        connectionState: states[state] || 'unknown',
        responseTime: `${responseTime}ms`,
        database: mongoose.connection.name,
        collections: stats.collections,
        documents: stats.objects,
        dataSize: formatBytes(stats.dataSize),
        indexSize: formatBytes(stats.indexSize),
        storageSize: formatBytes(stats.storageSize)
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'database',
      status: 'unhealthy',
      details: {
        error: error.message,
        connectionState: mongoose.connection.readyState
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Redis health check
 */
async function checkRedis() {
  try {
    const startTime = Date.now();
    const redisInfo = await getRedisInfo();
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'redis',
      status: redisInfo.connected && responseTime < 500 ? 'healthy' : 'unhealthy',
      details: {
        connected: redisInfo.connected,
        responseTime: `${responseTime}ms`,
        usedMemory: redisInfo.usedMemory || 'N/A',
        totalConnections: redisInfo.totalConnections || 0,
        uptime: redisInfo.uptime ? `${redisInfo.uptime}s` : 'N/A',
        cacheHitRate: `${redisInfo.hitRate || 0}%`,
        cacheHits: redisInfo.cacheHits || 0,
        cacheMisses: redisInfo.cacheMisses || 0
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'redis',
      status: 'unhealthy',
      details: {
        error: error.message,
        connected: false
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Memory usage check
 */
function checkMemory() {
  const memoryUsage = process.memoryUsage();
  const heapUsed = memoryUsage.heapUsed;
  const heapTotal = memoryUsage.heapTotal;
  const heapUsedPercent = (heapUsed / heapTotal) * 100;
  
  let status = 'healthy';
  if (heapUsedPercent > 90) {
    status = 'unhealthy';
  } else if (heapUsedPercent > 70) {
    status = 'degraded';
  }
  
  return {
    component: 'memory',
    status,
    details: {
      heapUsed: formatBytes(heapUsed),
      heapTotal: formatBytes(heapTotal),
      heapUsedPercent: `${Math.round(heapUsedPercent)}%`,
      rss: formatBytes(memoryUsage.rss),
      external: formatBytes(memoryUsage.external),
      arrayBuffers: formatBytes(memoryUsage.arrayBuffers)
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Disk space check (simulated for demo)
 */
function checkDiskSpace() {
  // In production, you would use a library like `check-disk-space`
  // For now, we'll simulate a healthy disk
  return {
    component: 'disk',
    status: 'healthy',
    details: {
      free: 'Simulated - 50GB',
      total: 'Simulated - 100GB',
      usedPercent: '50%',
      warning: 'In production, implement actual disk space checking'
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * External services check
 */
async function checkExternalServices() {
  const services = [];
  
  // Check SMTP service if configured
  if (process.env.SMTP_HOST) {
    const smtpHealth = await checkSmtpService();
    services.push(smtpHealth);
  }
  
  // Check WhatsApp service if configured
  if (process.env.WHATSAPP_ENABLED === 'true') {
    const whatsappHealth = await checkWhatsAppService();
    services.push(whatsappHealth);
  }
  
  return services;
}

/**
 * Check SMTP service
 */
async function checkSmtpService() {
  try {
    // In production, you would actually test the SMTP connection
    // For now, we'll assume it's working if configured
    return {
      component: 'smtp',
      status: 'healthy',
      details: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true',
        configured: true
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'smtp',
      status: 'unhealthy',
      details: {
        error: error.message,
        configured: true
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Check WhatsApp service
 */
async function checkWhatsAppService() {
  try {
    // In production, you would check WhatsApp Web connection status
    return {
      component: 'whatsapp',
      status: 'healthy',
      details: {
        enabled: true,
        provider: process.env.WHATSAPP_PROVIDER || 'whatsapp_web',
        configured: true
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'whatsapp',
      status: 'unhealthy',
      details: {
        error: error.message,
        configured: true
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Performance health check
 */
function checkPerformance() {
  try {
    const perfStats = getPerfStats();
    const dbStats = getDbStats();
    
    // Calculate performance score
    const routesUnder200ms = perfStats.routesUnder200ms;
    const totalRoutes = perfStats.totals.totalRoutes;
    const performanceScore = totalRoutes > 0 ? (routesUnder200ms / totalRoutes) * 100 : 100;
    
    let status = 'healthy';
    if (performanceScore < 80) {
      status = 'degraded';
    }
    if (performanceScore < 50) {
      status = 'unhealthy';
    }
    
    // Check for slow queries
    const slowQueryPercentage = dbStats.summary?.slowQueryPercentage || 0;
    if (slowQueryPercentage > 20) {
      status = 'degraded';
    }
    if (slowQueryPercentage > 50) {
      status = 'unhealthy';
    }
    
    return {
      component: 'performance',
      status,
      details: {
        performanceScore: `${Math.round(performanceScore)}%`,
        routesUnder200ms,
        totalRoutes,
        avgResponseTime: `${perfStats.globalAvgMs}ms`,
        totalRequests: perfStats.totals.totalRequests,
        errorRate: `${perfStats.totals.totalErrors > 0 ? 
          Math.round((perfStats.totals.totalErrors / perfStats.totals.totalRequests) * 10000) / 100 : 0}%`,
        slowQueries: `${slowQueryPercentage}%`,
        prdTargetMet: perfStats.prdTargetMet
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'performance',
      status: 'degraded',
      details: {
        error: error.message
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Error rate health check
 */
function checkErrorRates() {
  try {
    const errorStats = getErrorMonitoringStats();
    
    // Calculate error rate
    const totalErrors = errorStats.summary?.totalErrors || 0;
    const recentErrorRate = errorStats.errors.reduce((sum, err) => sum + err.errorRate, 0);
    const avgErrorRate = errorStats.errors.length > 0 ? recentErrorRate / errorStats.errors.length : 0;
    
    let status = 'healthy';
    if (avgErrorRate > 5) {
      status = 'degraded';
    }
    if (avgErrorRate > 10) {
      status = 'unhealthy';
    }
    
    // Check for active alerts
    const activeAlerts = errorStats.summary?.activeAlerts || 0;
    if (activeAlerts > 0) {
      status = 'degraded';
    }
    if (activeAlerts > 5) {
      status = 'unhealthy';
    }
    
    return {
      component: 'error_monitoring',
      status,
      details: {
        totalErrors,
        avgErrorRate: `${Math.round(avgErrorRate * 100) / 100}/min`,
        uniqueErrorTypes: errorStats.summary?.uniqueErrorTypes || 0,
        activeAlerts,
        monitoringEnabled: errorStats.summary?.monitoringEnabled || false,
        topErrors: errorStats.errors.slice(0, 3).map(err => ({
          type: err.errorKey,
          rate: `${err.errorRate}/min`,
          count: err.totalCount
        }))
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      component: 'error_monitoring',
      status: 'degraded',
      details: {
        error: error.message
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get detailed system metrics for monitoring dashboard
 */
export async function getSystemMetrics() {
  const [health, perfStats, dbStats, errorStats, redisInfo] = await Promise.all([
    getSystemHealth(),
    getPerfStats(),
    getDbStats(),
    getErrorMonitoringStats(),
    getRedisInfo()
  ]);
  
  return {
    health,
    performance: perfStats,
    database: dbStats,
    errors: errorStats,
    redis: redisInfo,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd()
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Health check endpoint response
 */
export async function healthCheckResponse(req, res) {
  try {
    const health = await getSystemHealth();
    
    if (health.status === 'unhealthy') {
      return res.status(503).json({
        success: false,
        status: 'unhealthy',
        message: 'Service unavailable',
        health
      });
    }
    
    return res.status(200).json({
      success: true,
      status: 'healthy',
      message: 'Service is healthy',
      health
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message
    });
  }
}

/**
 * Metrics endpoint response
 */
export async function metricsResponse(req, res) {
  try {
    const metrics = await getSystemMetrics();
    
    return res.status(200).json({
      success: true,
      metrics
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get metrics',
      error: error.message
    });
  }
}