import mongoose from 'mongoose';
import { logWarn } from './logger.js';

const queryStats = new Map();
const SLOW_QUERY_THRESHOLD = 100; // milliseconds

const ATTACHED = Symbol('dbMonitorAttached');
// In-flight operations keyed by `${connectionId}:${requestId}` so duration and
// result can be attributed to the correct collection + command after completion.
const activeOps = new Map();

// Command names whose value field holds the target collection name.
const COLLECTION_FIELDS = [
  'insert',
  'find',
  'update',
  'delete',
  'aggregate',
  'count',
  'distinct',
  'findAndModify',
  'findandmodify',
  'mapReduce',
  'createIndexes',
  'listIndexes',
  'drop',
  'renameCollection',
];

function getCollectionName(command = {}) {
  if (!command || typeof command !== 'object') return 'unknown';
  for (const key of COLLECTION_FIELDS) {
    const value = command[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

function recordOperation(queryKey, durationMs, failed) {
  let stats = queryStats.get(queryKey);
  if (!stats) {
    stats = {
      count: 0,
      totalDuration: 0,
      maxDuration: 0,
      minDuration: Infinity,
      slowQueries: 0,
      errors: 0,
      lastQuery: null,
      avgDuration: 0,
    };
    queryStats.set(queryKey, stats);
  }

  stats.count++;
  stats.totalDuration += durationMs;
  stats.maxDuration = Math.max(stats.maxDuration, durationMs);
  stats.minDuration = Math.min(stats.minDuration, durationMs);
  stats.lastQuery = new Date();
  stats.avgDuration = stats.totalDuration / stats.count;

  if (failed) stats.errors++;

  if (durationMs > SLOW_QUERY_THRESHOLD) {
    stats.slowQueries++;
    const [collection, command] = queryKey.split('.');
    logWarn(`[DB Slow Query] ${queryKey} took ${durationMs}ms`, {
      collection,
      command: command || 'unknown',
      durationMs,
      threshold: SLOW_QUERY_THRESHOLD,
      timestamp: new Date().toISOString(),
    });
  }
}

function opKey(event) {
  return `${event.connectionId ?? 'c'}:${event.requestId ?? 'r'}`;
}

function onCommandStarted(event) {
  const command = event.command ?? {};
  activeOps.set(opKey(event), {
    collection: getCollectionName(command),
    commandName: String(event.commandName || 'unknown'),
  });
}

function onCommandFinished(event) {
  const key = opKey(event);
  const started = activeOps.get(key);
  activeOps.delete(key);

  const collection = started?.collection ?? 'unknown';
  const commandName = started?.commandName ?? String(event.commandName || 'unknown');
  const durationMs = typeof event.duration === 'number' ? event.duration : 0;

  recordOperation(`${collection}.${commandName}`, durationMs, event.failure === true);
}

function attachToClient(client) {
  if (!client || client[ATTACHED]) return false;

  client.on('commandStarted', onCommandStarted);
  client.on('commandSucceeded', onCommandFinished);
  client.on('commandFailed', (event) => onCommandFinished({ ...event, failure: true }));
  client[ATTACHED] = true;
  return true;
}

/**
 * Database query performance monitoring, driven by the MongoDB driver's
 * command-monitoring events. Unlike `mongoose.set('debug', …)` this works in
 * production because it does not rely on Mongoose's debug flag — every command
 * sent to the server (find/insert/update/delete/aggregate/…) is observed and
 * timed via the MongoDB APM events emitted by the underlying MongoClient.
 */
export function setupDbMonitoring() {
  const tryAttach = () => {
    let client;
    try {
      client = mongoose.connection.getClient();
    } catch {
      // Not connected yet — retry on the next connect.open.
    }

    if (attachToClient(client)) return true;

    // No live client yet: retry once the connection is established.
    mongoose.connection.once('connected', () => {
      try {
        attachToClient(mongoose.connection.getClient());
      } catch {
        // The connection opened between the event and getClient — rare; the
        // next reconnect frame will re-attempt. Non-fatal.
      }
    });
    return false;
  };

  if (!tryAttach()) {
    logWarn('[DBMonitor] No MongoDB client available yet — database monitoring will attach on connection.');
  }
}

/**
 * Get database performance statistics
 */
export function getDbStats() {
  const stats = [];
  let totalQueries = 0;
  let totalSlowQueries = 0;
  let totalErrors = 0;
  let totalDuration = 0;

  for (const [queryKey, data] of queryStats) {
    stats.push({
      query: queryKey,
      count: data.count,
      avgDuration: Math.round(data.avgDuration * 100) / 100,
      minDuration: data.minDuration === Infinity ? 0 : data.minDuration,
      maxDuration: data.maxDuration,
      slowQueries: data.slowQueries,
      errors: data.errors,
      slowQueryPercentage: data.count > 0 ? Math.round((data.slowQueries / data.count) * 100) : 0,
      lastQuery: data.lastQuery,
    });

    totalQueries += data.count;
    totalSlowQueries += data.slowQueries;
    totalErrors += data.errors;
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
      totalErrors,
      overallAvgDuration: overallAvg,
      slowQueryPercentage,
      slowQueryThreshold: SLOW_QUERY_THRESHOLD,
      monitoringEnabled: true,
      source: 'driver-command-monitoring',
    },
  };
}

/**
 * Reset database statistics
 */
export function resetDbStats() {
  queryStats.clear();
  activeOps.clear();
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