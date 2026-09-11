import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const loggerMock = vi.hoisted(() => {
  const childOpts = [];
  function makeLog() {
    const log = {
      levels: { values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } },
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child(bindings, opts) {
        childOpts.push(opts);
        return log;
      },
    };
    return log;
  }
  return { logger: makeLog(), childOpts, logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() };
});

vi.mock("../utils/logger.js", () => ({
  logger: loggerMock.logger,
  logInfo: loggerMock.logInfo,
  logWarn: loggerMock.logWarn,
  logError: loggerMock.logError,
  default: loggerMock.logger,
}));

let httpLogger;
let originalEnv;

beforeAll(async () => {
  originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const mod = await import("../middleware/httpLogger.js");
  httpLogger = mod.httpLogger;
});

afterAll(() => {
  process.env.NODE_ENV = originalEnv;
});

function mockRes(statusCode) {
  const handlers = {};
  return {
    statusCode,
    setHeader: vi.fn(),
    end: vi.fn(),
    on: vi.fn((ev, cb) => {
      handlers[ev] = cb;
    }),
    removeListener: vi.fn(),
    fire(ev) {
      handlers[ev]?.();
    },
  };
}

describe("httpLogger middleware", () => {
  beforeEach(() => {
    for (const lvl of Object.keys(loggerMock.logger.levels.values)) {
      loggerMock.logger[lvl].mockClear();
    }
  });

  it("logs successful responses at info level with the formatted message", () => {
    const res = mockRes(204);
    httpLogger({ method: "GET", url: "/ok", originalUrl: "/ok", headers: {} }, res, () => {});
    res.fire("finish");

    expect(loggerMock.logger.info).toHaveBeenCalledWith(expect.anything(), "GET /ok 204");
  });

  it("logs 4xx responses at warn level", () => {
    const res = mockRes(400);
    httpLogger({ method: "GET", url: "/warn", originalUrl: "/warn", headers: {} }, res, () => {});
    res.fire("finish");

    expect(loggerMock.logger.warn).toHaveBeenCalledWith(expect.anything(), "GET /warn 400");
  });

  it("logs 5xx responses at error level with the error message", () => {
    const res = mockRes(500);
    httpLogger({ method: "POST", url: "/boom", originalUrl: "/boom", headers: {} }, res, () => {});
    res.fire("finish");

    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.anything(),
      "POST /boom 500 - failed with status code 500",
    );
  });

  it("reuses an existing request id", () => {
    const req = { id: "custom-id", method: "GET", url: "/x", headers: {} };
    httpLogger(req, mockRes(200), () => {});
    expect(req.id).toBe("custom-id");
  });

  it("generates a request id when missing", () => {
    const req = { method: "GET", url: "/x", headers: {} };
    httpLogger(req, mockRes(200), () => {});
    expect(req.id).toBeTruthy();
  });

  it("passes authorization/cookie redaction into the logger child options", () => {
    const opts = loggerMock.childOpts.find((o) => o && o.redact);
    expect(opts.redact.paths).toEqual(
      expect.arrayContaining(["req.headers.authorization", "req.headers.cookie"]),
    );
    expect(opts.redact.censor).toBe("[REDACTED]");
  });

  it("skips response logging for health endpoints in production", () => {
    const res = mockRes(200);
    httpLogger({ method: "GET", url: "/api/health", originalUrl: "/api/health", headers: {} }, res, () => {});
    expect(res.on.mock.calls.map((c) => c[0])).not.toContain("finish");
    expect(res.on.mock.calls.map((c) => c[0])).not.toContain("close");
    res.fire("finish");
    expect(loggerMock.logger.info).not.toHaveBeenCalled();
  });

  it("attaches response listeners for non-health endpoints", () => {
    const res = mockRes(200);
    httpLogger({ method: "GET", url: "/staff", originalUrl: "/staff", headers: {} }, res, () => {});
    expect(res.on.mock.calls.map((c) => c[0])).toContain("finish");
  });

  it("does not auto-log responses outside production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      vi.resetModules();
      const devMod = await import("../middleware/httpLogger.js");
      const res = mockRes(201);
      devMod.httpLogger({ method: "GET", url: "/dev", headers: {} }, res, () => {});
      expect(res.on).not.toHaveBeenCalled();
      res.fire("finish");
      expect(loggerMock.logger.info).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
      vi.resetModules();
    }
  });
});