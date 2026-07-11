import mongoose from 'mongoose';
import asyncHandler from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/sendSuccess.js";
import { getRedisInfo, getAggregatedTelemetry } from "../../config/redis.js";

export const getHealth = asyncHandler(async (_req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  const redisInfo = await getRedisInfo();
  const telemetry = await getAggregatedTelemetry();

  return sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
    mongodb: mongoStatus,
    node: process.version,
    platform: process.platform,
    redis: redisInfo,
    telemetry,
  });
});
