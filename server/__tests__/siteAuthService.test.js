import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../utils/loginThrottle.js", () => ({
  assertNotLocked: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
}));

vi.mock("../utils/auditChain.js", () => ({
  appendAuditLog: vi.fn(async () => ({})),
}));

vi.mock("../modules/site/admin/admin.model.js", () => {
  class MockSiteAdmin {
    constructor(data = {}) {
      Object.assign(this, data);
      this.save = vi.fn(async () => this);
    }
    static findOne = vi.fn();
    static findById = vi.fn();
    static findByIdAndUpdate = vi.fn();
    static findOneAndUpdate = vi.fn();
  }
  return { default: MockSiteAdmin };
});

vi.mock("nodemailer", () => {
  const sendMail = vi.fn(async () => ({ messageId: "m1" }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return { default: { createTransport }, createTransport };
});

import { getRedis } from "../config/redis.js";
import { logInfo, logWarn } from "../utils/logger.js";
import { resetFailedLogins } from "../utils/loginThrottle.js";
import { appendAuditLog } from "../utils/auditChain.js";
import SiteAdmin from "../modules/site/admin/admin.model.js";
import nodemailer from "nodemailer";

import {
  alertRecoveryComplete,
  authenticateSiteAdmin,
  completeSiteAdminLogin,
  create2faChallenge,
  createSiteAdmin,
  initiateRecovery,
  logRecoveryAttempt,
  refreshSiteAdmin,
  rotateSiteAdminToken,
  verifyRecoveryOtp,
} from "../modules/site/auth/siteAuth.service.js";

function makeAdmin(overrides = {}) {
  return {
    _id: "a1",
    email: "root@dentalos.app",
    role: "super_admin",
    isActive: true,
    twoFactorEnabled: true,
    tokenVersion: 0,
    lastLogin: null,
    comparePassword: vi.fn(async () => true),
    save: vi.fn(async function () {
      return this;
    }),
    ...overrides,
  };
}

function makeRedis() {
  const store = new Map();
  return {
    async setex(key, seconds, value) {
      store.set(key, value);
    },
    async get(key) {
      return store.get(key);
    },
    async del(...keys) {
      keys.forEach((k) => store.delete(k));
    },
    async incr(key) {
      const v = (store.get(key) || 0) + 1;
      store.set(key, v);
      return v;
    },
    async expire(key, seconds) {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.SITE_RECOVERY_KEY = "recovery-key";
  delete process.env.JWT_2FA_SECRET;
  vi.mocked(SiteAdmin.findOne).mockReset();
  vi.mocked(SiteAdmin.findById).mockReset();
  vi.mocked(SiteAdmin.findByIdAndUpdate).mockReset();
  vi.mocked(SiteAdmin.findOneAndUpdate).mockReset();
  vi.mocked(getRedis).mockReset();
});

describe("authenticateSiteAdmin", () => {
  it("logs an admin in with the correct password", async () => {
    const admin = makeAdmin();
    vi.mocked(SiteAdmin.findOne).mockReturnValue({ select: vi.fn().mockResolvedValue(admin) });
    const result = await authenticateSiteAdmin("root@dentalos.app", "pw");
    expect(result).toBe(admin);
    expect(resetFailedLogins).toHaveBeenCalledWith("root@dentalos.app");
  });

  it("rejects an unknown email with 401", async () => {
    vi.mocked(SiteAdmin.findOne).mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await expect(authenticateSiteAdmin("nope@x.com", "pw")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a disabled account with 403", async () => {
    vi.mocked(SiteAdmin.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(makeAdmin({ isActive: false })),
    });
    await expect(authenticateSiteAdmin("root@dentalos.app", "pw")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("records a failed login on a wrong password", async () => {
    vi.mocked(SiteAdmin.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(makeAdmin({ comparePassword: vi.fn(async () => false) })),
    });
    await expect(authenticateSiteAdmin("root@dentalos.app", "bad")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(resetFailedLogins).not.toHaveBeenCalledWith("root@dentalos.app");
  });

  it("blocks a super admin who has not enabled 2FA", async () => {
    vi.mocked(SiteAdmin.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(makeAdmin({ twoFactorEnabled: false })),
    });
    await expect(authenticateSiteAdmin("root@dentalos.app", "pw")).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("2FA"),
    });
  });

  it("lets a non-super admin log in without 2FA", async () => {
    vi.mocked(SiteAdmin.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(makeAdmin({ role: "support", twoFactorEnabled: false })),
    });
    const result = await authenticateSiteAdmin("support@dentalos.app", "pw");
    expect(result.role).toBe("support");
  });
});

describe("token lifecycle", () => {
  it("create2faChallenge signs a single-use jti challenge", () => {
    const token = create2faChallenge("a1");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe("a1");
    expect(decoded.type).toBe("2fa_challenge");
    expect(decoded.jti).toBeTruthy();
  });

  it("completeSiteAdminLogin stamps lastLogin and saves", async () => {
    const admin = makeAdmin();
    await completeSiteAdminLogin(admin);
    expect(admin.lastLogin).toBeInstanceOf(Date);
    expect(admin.save).toHaveBeenCalled();
  });

  it("refreshSiteAdmin rejects a stale token version", async () => {
    await expect(refreshSiteAdmin({ tokenVersion: 0 }, 1)).resolves.toBe(false);
    await expect(refreshSiteAdmin({ tokenVersion: 1 }, 1)).resolves.toBe(true);
    await expect(refreshSiteAdmin({}, 1)).resolves.toBe(true);
  });

  it("rotateSiteAdminToken advances the token version atomically", async () => {
    vi.mocked(SiteAdmin.findOneAndUpdate).mockResolvedValue({ _id: "a1", tokenVersion: 1 });
    const updated = await rotateSiteAdminToken(makeAdmin(), { tokenVersion: 0 });
    expect(SiteAdmin.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "a1", tokenVersion: 0 },
      { $inc: { tokenVersion: 1 } },
      { returnDocument: "after" },
    );
    expect(updated.tokenVersion).toBe(1);
  });

  it("rotateSiteAdminToken falls back to the admin tokenVersion when not decoded", async () => {
    vi.mocked(SiteAdmin.findOneAndUpdate).mockResolvedValue(null);
    const updated = await rotateSiteAdminToken(makeAdmin({ tokenVersion: 3 }), {});
    expect(SiteAdmin.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "a1", tokenVersion: 3 },
      expect.any(Object),
      expect.any(Object),
    );
    expect(updated).toBeNull();
  });
});

describe("createSiteAdmin", () => {
  it("creates an admin with the given role", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(null);
    const result = await createSiteAdmin({ name: "Op", email: "op@x.com", password: "pw", role: "support" });
    expect(result).toBeInstanceOf(SiteAdmin);
    expect(result.save).toHaveBeenCalled();
  });

  it("defaults the role to support", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(null);
    const result = await createSiteAdmin({ name: "Op", email: "op2@x.com", password: "pw" });
    expect(result.role).toBe("support");
  });

  it("rejects a duplicate email with 409", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin());
    await expect(createSiteAdmin({ name: "Op", email: "dup@x.com", password: "pw" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("initiateRecovery", () => {
  it("sends an OTP and returns a recovery token", async () => {
    vi.mocked(getRedis).mockReturnValue(makeRedis());
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin());
    const result = await initiateRecovery("ROOT@dentalos.app", "recovery-key", { ip: "1.2.3.4", userAgent: "test" });
    expect(result.recoveryToken).toBeTruthy();
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalled();
  });

  it("fails with 403 when recovery is not configured", async () => {
    delete process.env.SITE_RECOVERY_KEY;
    await expect(initiateRecovery("a@x.com", "key", {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("fails with 401 for a wrong recovery key", async () => {
    await expect(initiateRecovery("a@x.com", "wrong-key", {})).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid recovery key",
    });
    expect(logWarn).toHaveBeenCalled();
  });

  it("fails with 401 when the admin is missing or disabled", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(null);
    await expect(initiateRecovery("a@x.com", "recovery-key", {})).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("fails with 403 for a non-super-admin role", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin({ role: "support" }));
    await expect(initiateRecovery("a@x.com", "recovery-key", {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("fails with 500 when Redis is unavailable", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin());
    vi.mocked(getRedis).mockReturnValue(null);
    await expect(initiateRecovery("a@x.com", "recovery-key", {})).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe("verifyRecoveryOtp", () => {
  let redis;
  let recoveryToken;

  beforeEach(() => {
    redis = makeRedis();
    vi.mocked(getRedis).mockReturnValue(redis);
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin());
    vi.mocked(SiteAdmin.findById).mockResolvedValue(makeAdmin());
    recoveryToken = jwt.sign(
      { sub: "a1", email: "root@dentalos.app", type: "recovery_init" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
  });

  it("fails with 500 when Redis is unavailable", async () => {
    vi.mocked(getRedis).mockReturnValue(null);
    await expect(verifyRecoveryOtp("a@x.com", "123456", "tok", {})).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("rejects a forged recovery token", async () => {
    await expect(verifyRecoveryOtp("a@x.com", "123456", "forged", {})).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a token minted for a different email", async () => {
    const badToken = jwt.sign(
      { sub: "a1", email: "other@x.com", type: "recovery_init" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    await expect(verifyRecoveryOtp("root@dentalos.app", "123456", badToken, {})).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a missing OTP (expired)", async () => {
    await expect(verifyRecoveryOtp("root@dentalos.app", "123456", recoveryToken, {})).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining("expired"),
    });
  });

  it("locks recovery after 3 wrong OTP attempts", async () => {
    await redis.setex(`recovery:otp:root@dentalos.app`, 300, "123456");
    let lockSeen = false;
    for (let i = 0; i < 3; i++) {
      try {
        await verifyRecoveryOtp("root@dentalos.app", "000000", recoveryToken, {});
      } catch (err) {
        if (err.statusCode === 403) lockSeen = true;
      }
    }
    expect(lockSeen).toBe(true);
  });

  it("bootstraps 2FA after a valid OTP", async () => {
    await redis.setex(`recovery:otp:root@dentalos.app`, 300, "123456");
    await redis.setex(`recovery:token:root@dentalos.app`, 300, recoveryToken);

    const result = await verifyRecoveryOtp("ROOT@dentalos.app", "123456", recoveryToken, {});
    expect(result.admin).toBeDefined();
    expect(result.otpauth).toContain("issuer=Dental%20OS");
    expect(result.backupCodes).toHaveLength(8);
  });

  it("rejects when the admin was deleted after recovery init", async () => {
    await redis.setex(`recovery:otp:root@dentalos.app`, 300, "123456");
    vi.mocked(SiteAdmin.findById).mockResolvedValue(null);
    await expect(verifyRecoveryOtp("root@dentalos.app", "123456", recoveryToken, {})).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe("alertRecoveryComplete", () => {
  it("logs the security event even without integrations", async () => {
    delete process.env.SLACK_SECURITY_WEBHOOK;
    delete process.env.SECURITY_ALERT_EMAIL;
    await expect(
      alertRecoveryComplete({ email: "a@x.com", ip: "1.2.3.4", userAgent: "t" }),
    ).resolves.toBeUndefined();
  });

  it("posts to Slack and emails when configured", async () => {
    process.env.SLACK_SECURITY_WEBHOOK = "https://hooks.slack.com/test";
    process.env.SECURITY_ALERT_EMAIL = "sec@x.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await alertRecoveryComplete({ email: "a@x.com", ip: "1.2.3.4", userAgent: "t" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.SLACK_SECURITY_WEBHOOK;
    delete process.env.SECURITY_ALERT_EMAIL;
  });

  it("tolerates Slack/email integration failures", async () => {
    process.env.SLACK_SECURITY_WEBHOOK = "https://hooks.slack.com/test";
    process.env.SECURITY_ALERT_EMAIL = "sec@x.com";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(
      alertRecoveryComplete({ email: "a@x.com", ip: "1.2.3.4", userAgent: "t" }),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    delete process.env.SLACK_SECURITY_WEBHOOK;
    delete process.env.SECURITY_ALERT_EMAIL;
  });

  it("warns when Slack returns a non-ok status", async () => {
    process.env.SLACK_SECURITY_WEBHOOK = "https://hooks.slack.com/test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await alertRecoveryComplete({ email: "a@x.com", ip: "1.2.3.4", userAgent: "t" });
    expect(logWarn).toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.SLACK_SECURITY_WEBHOOK;
  });
});

describe("logRecoveryAttempt", () => {
  it("appends an audit log entry for a successful attempt", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(makeAdmin());
    await logRecoveryAttempt({
      email: "root@dentalos.app",
      ip: "1.2.3.4",
      userAgent: "t",
      success: true,
      reason: "otp",
    });
    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "site", action: "auth.recovery_attempt" }),
    );
  });

  it("tolerates audit log failure", async () => {
    vi.mocked(SiteAdmin.findOne).mockResolvedValue(null);
    vi.mocked(appendAuditLog).mockRejectedValueOnce(new Error("audit down"));
    await expect(
      logRecoveryAttempt({ email: "nope@x.com", ip: "1.2.3.4", userAgent: "t", success: false }),
    ).resolves.toBeUndefined();
    expect(logWarn).toHaveBeenCalled();
  });
});