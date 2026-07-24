import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abuseMonitor } from "./middleware/abuseMonitor.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { httpLogger } from "./middleware/httpLogger.js";
import { logError } from "./middleware/logError.js";
import { requestId } from "./middleware/requestId.js";
import { userRateLimit } from "./middleware/userRateLimit.js";
import { sanitizeBody } from "./utils/sanitize.js";
import apiRouter from "./routes/routes.js";
import { perfMiddleware } from "./utils/perfMonitor.js";
import { setupSwagger } from "./swagger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const app = express();
const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim()).filter(Boolean)
  : ["http://localhost:5173"];

if (isProd && !process.env.CLIENT_URL) {
  throw new Error("CLIENT_URL is required in production");
}

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
        (o) => origin === o,
      );
      if (allowed) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(sanitizeBody);

setupSwagger(app);

app.set("trust proxy", 1);

app.use(httpLogger);

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
app.use("/api/site/auth/create", authLimiter);
app.use("/api/site/2fa/verify-login", authLimiter);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down" },
});

app.use("/api", requestId, generalLimiter, perfMiddleware, abuseMonitor, userRateLimit({ windowMs: 60000, max: 200 }), apiRouter);

app.use(logError);
app.use(notFound);
app.use(errorHandler);

export async function upgradeRateLimitStore() {
  try {
    const { getRedis } = await import("./config/redis.js");
    const redisClient = getRedis();
    if (!redisClient || redisClient.status !== "ready") {
      console.warn("[RateLimit] Redis not connected - using in-memory store");
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
    console.warn("[RateLimit] Redis not available - using in-memory store");
    return false;
  }
}

export default app;
