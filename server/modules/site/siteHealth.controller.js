import mongoose from 'mongoose';
import asyncHandler from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/sendSuccess.js";
import { getRedisInfo, getAggregatedTelemetry } from "../../config/redis.js";

/**
 * @swagger
 * /api/v1/site/health:
 *   get:
 *     tags: [Health]
 *     summary: Get system health status
 *     description: Returns MongoDB, Redis, memory, and telemetry info.
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [ok, degraded]
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: integer
 *                     memory:
 *                       type: object
 *                       properties:
 *                         rss: { type: integer }
 *                         heapTotal: { type: integer }
 *                         heapUsed: { type: integer }
 *                         external: { type: integer }
 *                     mongodb:
 *                       type: object
 *                       properties:
 *                         status: { type: string }
 *                         latencyMs: { type: integer, nullable: true }
 *                         readyState: { type: integer }
 *                     redis:
 *                       type: object
 *                     node:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     pid:
 *                       type: integer
 *       503:
 *         description: System is degraded
 */
export const getHealth = asyncHandler(async (_req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  // Check MongoDB connectivity
  let mongoStatus = 'disconnected';
  let mongoLatencyMs = null;
  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    mongoLatencyMs = Date.now() - start;
    mongoStatus = 'connected';
  } catch {
    mongoStatus = 'error';
  }

  // Check Redis connectivity
  let redisInfo = { connected: false };
  try {
    redisInfo = await getRedisInfo();
  } catch {
    redisInfo = { connected: false, error: 'Failed to check Redis' };
  }

  const telemetry = await getAggregatedTelemetry();
  const healthy = mongoStatus === 'connected';

  res.status(healthy ? 200 : 503);

  return sendSuccess(res, {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    mongodb: {
      status: mongoStatus,
      latencyMs: mongoLatencyMs,
      readyState: mongoose.connection.readyState,
    },
    redis: redisInfo,
    node: process.version,
    platform: process.platform,
    pid: process.pid,
    telemetry,
  });
});
