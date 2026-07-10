import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/error.js";
import { logError } from "./middleware/logError.js";
import { abuseMonitor } from "./middleware/abuseMonitor.js";
import { perfMiddleware } from "./services/perfMonitor.js";
import apiRouter from "./routes/routes.js";

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
  : ["http://localhost:5173"];

app.use((_req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64url");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          isProd ? "'strict-dynamic'" : "'unsafe-inline'",
          ...(isProd ? [] : ["'unsafe-eval'"]),
          (_req, res) => `'nonce-${res.locals.nonce}'`,
        ].filter(Boolean),
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins.some(
        (o) => origin === o || origin.startsWith(o.replace(/\/$/, "")),
      );
      if (allowed) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.set("trust proxy", 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);
app.use("/api/site/auth/login", authLimiter);
app.use("/api/site/auth/refresh", authLimiter);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down" },
});

app.use("/api", generalLimiter, perfMiddleware, abuseMonitor, apiRouter);

app.use(logError);
app.use(notFound);
app.use(errorHandler);

export async function upgradeRateLimitStore() {
  try {
    const { getRedis } = await import("./config/redis.js");
    const redisClient = getRedis();
    if (!redisClient || redisClient.status !== 'ready') {
      console.warn("[RateLimit] Redis not connected — using in-memory store");
      return false;
    }

    const { default: RedisStore } = await import("rate-limit-redis");
    const store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    });
    authLimiter.store = store;
    generalLimiter.store = store;
    console.log("[RateLimit] Upgraded auth + general limiters to Redis store");
    return true;
  } catch {
    console.warn("[RateLimit] Redis not available — using in-memory store");
    return false;
  }
}

export default app;
