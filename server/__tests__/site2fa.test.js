import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";

const totp = new TOTP({
  epochTolerance: 30,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

vi.mock("../modules/site/admin/admin.model.js", () => {
  class MockSiteAdmin {}
  MockSiteAdmin.findById = vi.fn();
  MockSiteAdmin.findOne = vi.fn();
  MockSiteAdmin.findByIdAndUpdate = vi.fn();
  return { default: MockSiteAdmin };
});

vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../modules/site/auth/siteAuth.service.js", () => ({
  authenticateSiteAdmin: vi.fn(),
  create2faChallenge: vi.fn(),
  completeSiteAdminLogin: vi.fn(),
  refreshSiteAdmin: vi.fn(),
  rotateSiteAdminToken: vi.fn(),
  createSiteAdmin: vi.fn(),
  recoverSiteAdmin: vi.fn(),
  initiateRecovery: vi.fn(),
  verifyRecoveryOtp: vi.fn(),
  logRecoveryAttempt: vi.fn(),
  alertRecoveryComplete: vi.fn(),
}));

import { bootstrap2fa, verify2faLogin } from "../modules/site/auth/site2fa.service.js";
import SiteAdmin from "../modules/site/admin/admin.model.js";
import * as siteAuthService from "../modules/site/auth/siteAuth.service.js";
import siteAuthRouter from "../modules/site/auth/siteAuth.routes.js";
import ApiError from "../utils/ApiError.js";

function makeSiteApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/site/auth", siteAuthRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

describe("site2fa.service — bootstrap2fa", () => {
  it("enables 2FA, generates a secret, and stores hashed backup codes", async () => {
    const admin = {
      email: "root@dentalos.app",
      tokenVersion: 0,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      save: vi.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };

    const result = await bootstrap2fa(admin);

    expect(result.backupCodes).toHaveLength(8);
    result.backupCodes.forEach((code) => expect(code).toMatch(/^[0-9A-F]{8}$/));
    expect(admin.twoFactorEnabled).toBe(true);
    expect(admin.tokenVersion).toBe(1);
    expect(admin.twoFactorSecret).toBeTruthy();
    expect(result.otpauth).toContain("issuer=Dental%20OS");
    expect(result.otpauth).toContain(encodeURIComponent(admin.email));
    expect(admin.twoFactorBackupCodes).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(await bcrypt.compare(result.backupCodes[i], admin.twoFactorBackupCodes[i])).toBe(true);
    }
    expect(admin.save).toHaveBeenCalledTimes(1);
  });
});

describe("site2fa.service — verify2faLogin", () => {
  beforeEach(() => {
    vi.mocked(SiteAdmin.findById).mockReset();
  });

  it("rejects an invalid TOTP token with 401", async () => {
    vi.mocked(SiteAdmin.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "a1",
        twoFactorEnabled: true,
        twoFactorSecret: "R2HRESMJW3Y27SOTBG3BLL2DV7FMNQGM",
        twoFactorBackupCodes: [],
        save: vi.fn(),
      }),
    });
    await expect(verify2faLogin("a1", { token: "000000" })).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid 2FA token or backup code",
    });
  });

  it("accepts a valid TOTP token generated from the admin's secret", async () => {
    const admin = {
      _id: "a1",
      twoFactorEnabled: true,
      twoFactorSecret: "R2HRESMJW3Y27SOTBG3BLL2DV7FMNQGM",
      twoFactorBackupCodes: [],
      save: vi.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };
    vi.mocked(SiteAdmin.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue(admin),
    });

    const code = await totp.generate({ secret: admin.twoFactorSecret });
    const ok = await verify2faLogin("a1", { token: code });
    expect(ok).toBe(true);
    expect(admin.lastLogin).toBeInstanceOf(Date);
    expect(admin.save).toHaveBeenCalledTimes(1);
  });

  it("consumes a valid backup code on first use", async () => {
    const code = "ABCD1234";
    const admin = {
      _id: "a1",
      twoFactorEnabled: true,
      twoFactorSecret: "R2HRESMJW3Y27SOTBG3BLL2DV7FMNQGM",
      twoFactorBackupCodes: [await bcrypt.hash(code, 4)],
      save: vi.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };
    vi.mocked(SiteAdmin.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue(admin),
    });

    const ok = await verify2faLogin("a1", { backupCode: code });
    expect(ok).toBe(true);
    expect(admin.twoFactorBackupCodes).toHaveLength(0);
  });
});

describe("Site recovery (two-step OTP flow)", () => {
  beforeEach(() => {
    vi.mocked(siteAuthService.initiateRecovery).mockReset();
    vi.mocked(siteAuthService.verifyRecoveryOtp).mockReset();
    vi.mocked(siteAuthService.logRecoveryAttempt).mockReset();
    vi.mocked(siteAuthService.alertRecoveryComplete).mockReset();
  });

  it("initiates recovery and returns a recovery token", async () => {
    vi.mocked(siteAuthService.initiateRecovery).mockResolvedValue({
      recoveryToken: "recovery-token-123",
    });

    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/initiate")
      .send({ email: "root@dentalos.app", recoveryKey: "some-recovery-key" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recoveryToken).toBe("recovery-token-123");
    expect(res.body.data.expiresIn).toBe(300);
    expect(siteAuthService.initiateRecovery).toHaveBeenCalledWith(
      "root@dentalos.app",
      "some-recovery-key",
      expect.objectContaining({ ip: expect.any(String), userAgent: expect.any(String) }),
    );
  });

  it("returns 400 when the recovery key is missing", async () => {
    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/initiate")
      .send({ email: "root@dentalos.app" });
    expect(res.status).toBe(400);
    expect(siteAuthService.initiateRecovery).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid recovery key", async () => {
    vi.mocked(siteAuthService.initiateRecovery).mockRejectedValue(
      ApiError.unauthorized("Invalid recovery key"),
    );
    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/initiate")
      .send({ email: "root@dentalos.app", recoveryKey: "wrong-key" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid recovery key");
  });

  it("returns 403 when the admin is not a super admin", async () => {
    vi.mocked(siteAuthService.initiateRecovery).mockRejectedValue(
      ApiError.forbidden("Recovery is only available for super admins"),
    );
    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/initiate")
      .send({ email: "support@dentalos.app", recoveryKey: "some-recovery-key" });
    expect(res.status).toBe(403);
  });

  it("completes recovery with a valid OTP and returns the new secret and codes", async () => {
    vi.mocked(siteAuthService.verifyRecoveryOtp).mockResolvedValue({
      admin: {
        _id: "a1",
        roleId: null,
        branch: null,
        tokenVersion: 0,
        toSafeObject: () => ({ email: "root@dentalos.app", role: "super_admin" }),
      },
      secret: "SECRETBASE32",
      otpauth: "otpauth://totp/Dental%20OS:root%40dentalos.app?secret=SECRETBASE32&issuer=Dental%20OS",
      backupCodes: ["A1B2C3D4", "E5F6A7B8", "90ABCDEF", "12345678", "ABCDEF01", "23456789", "0ABCDEF1", "3456789A"],
    });

    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/verify")
      .send({ email: "root@dentalos.app", otp: "123456", recoveryToken: "recovery-token-123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requires2faSetup).toBe(true);
    expect(res.body.data.secret).toBe("SECRETBASE32");
    expect(res.body.data.backupCodes).toHaveLength(8);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(siteAuthService.alertRecoveryComplete).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for an invalid OTP", async () => {
    vi.mocked(siteAuthService.verifyRecoveryOtp).mockRejectedValue(
      ApiError.unauthorized("Invalid or expired OTP"),
    );
    const res = await request(makeSiteApp())
      .post("/api/site/auth/recover/verify")
      .send({ email: "root@dentalos.app", otp: "000000", recoveryToken: "recovery-token-123" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired OTP");
  });
});
