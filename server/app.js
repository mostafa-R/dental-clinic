import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abuseMonitor } from "./middleware/abuseMonitor.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { httpLogger } from "./middleware/httpLogger.js";
import { ipAllowlist } from "./middleware/ipAllowlist.js";
import { logError } from "./middleware/logError.js";
import { maintenance } from "./middleware/maintenance.js";
import { requestId } from "./middleware/requestId.js";
import {
  requestSizeLimiter,
  securityAudit,
  securityHeaders
} from "./middleware/security.js";
import { tenantRouter } from "./middleware/tenantRouter.js";
import { userRateLimit } from "./middleware/userRateLimit.js";
import apiRouter from "./routes/routes.js";
import { setupSwagger } from "./swagger.js";
import { perfMiddleware } from "./utils/perfMonitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Must be set before any middleware that inspects req.ip (rate limiters,
// CSRF, abuse monitor) so the proxy hop is correctly skipped.
app.set("trust proxy", 1);

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
app.use(csrfProtection(allowedOrigins));

// Enhanced security middleware. Input sanitization and SQL-pattern blocking
// were removed intentionally: they false-positived on legitimate clinical
// text (e.g. "<5mm pocket", notes containing "create"/"update") while zod
// validators in each module already enforce strict input schemas.
app.use(securityHeaders);
app.use(requestSizeLimiter("55mb"));
app.use(securityAudit);

setupSwagger(app);

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

// Per-account auth limiter: keyed on the submitted email so brute-force
// attempts that rotate IPs (or hide behind a proxy) still get throttled
// against the target account. Falls back to IP when no email is submitted.
const emailAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email || "").toString().trim().toLowerCase();
    return email ? `email:${email}` : ipKeyGenerator(req);
  },
  message: {
    success: false,
    message: "Too many attempts for this account, please try again later",
  },
});

// Strict auth limiter on BOTH the unversioned and versioned prefixes.
// The v1 router is mounted at "/" and "/v1" (routes/routes.js), so the
// same auth endpoints are reachable via /api/* and /api/v1/*. Without the
// versioned mounts, /api/v1/auth/login etc. would only get the loose
// general limiter (200/min), opening a brute-force bypass.
const authLoginPaths = [
  "/api/auth/login",
  "/api/site/auth/login",
  "/api/site/auth/create",
  "/api/site/2fa/verify-login",
  "/api/v1/auth/login",
  "/api/v1/site/auth/login",
  "/api/v1/site/auth/create",
  "/api/v1/site/2fa/verify-login",
];
authLoginPaths.forEach((p) => {
  app.use(p, authLimiter, emailAuthLimiter);
});

app.use("/api/auth/refresh", authLimiter);
app.use("/api/site/auth/refresh", authLimiter);
app.use("/api/v1/auth/refresh", authLimiter);
app.use("/api/v1/site/auth/refresh", authLimiter);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down" },
});

app.use("/api", requestId, generalLimiter, perfMiddleware, abuseMonitor, userRateLimit({ windowMs: 60000, max: 200 }), maintenance, ipAllowlist, tenantRouter, apiRouter);

app.use(logError);
app.use(notFound);
app.use(errorHandler);

// Import and use error monitoring middleware
import { errorMonitoringMiddleware } from "./utils/errorMonitor.js";
app.use(errorMonitoringMiddleware);

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
    emailAuthLimiter.store = store;
    generalLimiter.store = store;
    console.log("[RateLimit] Upgraded auth + general limiters to Redis store");
    return true;
  } catch {
    console.warn("[RateLimit] Redis not available - using in-memory store");
    return false;
  }
}

export default app;
