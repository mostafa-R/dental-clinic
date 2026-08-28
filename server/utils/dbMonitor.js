import mongoose from 'mongoose';

const queryStats = new Map();
const SLOW_QUERY_THRESHOLD = 100; // milliseconds

/**
 * Database query performance monitoring
 * Tracks slow queries, query patterns, and performance metrics
 */
export function setupDbMonitoring() {
  // Monitor all queries
  mongoose.set('debug', (collectionName, method, query, doc) => {
    const startTime = Date.now();
    
    // Return a function that will be called when the query completes
    return (err, result) => {
      const duration = Date.now() - startTime;
      const queryKey = `${collectionName}.${method}`;
      
      // Track query statistics
      let stats = queryStats.get(queryKey);
      if (!stats) {
        stats = {
          count: 0,
          totalDuration: 0,
          maxDuration: 0,
          minDuration: Infinity,
          slowQueries: 0,
          lastQuery: null,
          avgDuration: 0
        };
        queryStats.set(queryKey, stats);
      }
      
      stats.count++;
      stats.totalDuration += duration;
      stats.maxDuration = Math.max(stats.maxDuration, duration);
      stats.minDuration = Math.min(stats.minDuration, duration);
      stats.lastQuery = new Date();
      stats.avgDuration = stats.totalDuration / stats.count;
      
      if (duration > SLOW_QUERY_THRESHOLD) {
        stats.slowQueries++;
        
        // Log slow queries in production
        if (process.env.NODE_ENV === 'production') {
          console.warn(`[DB Slow Query] ${queryKey} took ${duration}ms`, {
            collection: collectionName,
            method,
            duration,
            threshold: SLOW_QUERY_THRESHOLD,
            query: JSON.stringify(query),
            timestamp: new Date().toISOString()
          });
        }
      }
    };
  });
}

/**
 * Get database performance statistics
 */
export function getDbStats() {
  const stats = [];
  let totalQueries = 0;
  let totalSlowQueries = 0;
  let totalDuration = 0;
  
  for (const [queryKey, data] of queryStats) {
    stats.push({
      query: queryKey,
      count: data.count,
      avgDuration: Math.round(data.avgDuration * 100) / 100,
      minDuration: data.minDuration === Infinity ? 0 : data.minDuration,
      maxDuration: data.maxDuration,
      slowQueries: data.slowQueries,
      slowQueryPercentage: data.count > 0 ? Math.round((data.slowQueries / data.count) * 100) : 0,
      lastQuery: data.lastQuery
    });
    
    totalQueries += data.count;
    totalSlowQueries += data.slowQueries;
    totalDuration += data.totalDuration;
  }
  
  // Sort by slowest average duration
  stats.sort((a, b) => b.avgDuration - a.avgDuration);
  
  const overallAvg = totalQueries > 0 ? Math.round((totalDuration / totalQueries) * 100) / 100 : 0;
  const slowQueryPercentage = totalQueries > 0 ? Math.round((totalSlowQueries / totalQueries) * 100) : 0;
  
  return {
    queries: stats,
    summary: {
      totalQueries,
      totalSlowQueries,
      overallAvgDuration: overallAvg,
      slowQueryPercentage,
      slowQueryThreshold: SLOW_QUERY_THRESHOLD,
      monitoringEnabled: true
    }
  };
}

/**
 * Reset database statistics
 */
export function resetDbStats() {
  queryStats.clear();
}

/**
 * Middleware to add database stats to response headers in development
 */
export function dbStatsHeader(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && req.headers['x-debug-db'] === 'true') {
    const stats = getDbStats();
    res.setHeader('X-DB-Stats', JSON.stringify(stats.summary));
  }
  next();
}