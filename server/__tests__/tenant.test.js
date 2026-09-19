import { beforeEach, describe, expect, it, vi } from "vitest";

const { modelFactory } = vi.hoisted(() => ({
  modelFactory: () => {
    class MockModel {}
    MockModel.deleteMany = vi.fn();
    MockModel.findByIdAndDelete = vi.fn();
    MockModel.find = vi.fn();
    MockModel.findOne = vi.fn();
    MockModel.findById = vi.fn();
    MockModel.countDocuments = vi.fn();
    MockModel.validateMany = vi.fn();
    MockModel.create = vi.fn();
    MockModel.aggregate = vi.fn();
    MockModel.distinct = vi.fn();
    return { default: MockModel };
  },
}));

vi.mock("../core/transaction.js", () => ({
  withTransaction: vi.fn(),
}));

vi.mock("../core/counters.js", () => ({
  default: { deleteMany: vi.fn(), updateOne: vi.fn() },
}));

vi.mock("../modules/site/subscription/subscription.service.js", () => ({
  getPlanPrice: vi.fn(async () => 99),
}));

vi.mock("../utils/cache.js", () => ({
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
  invalidateTenant: vi.fn(),
  invalidateTenantRoles: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ unlink: vi.fn() }));

vi.mock("../modules/site/tenant/tenant.model.js", () => {
  class MockTenant {
    constructor(data = {}) {
      Object.assign(this, {
        name: "Clinic",
        plan: "basic",
        status: "trial",
        isActive: false,
        ...data,
        toObject: () => ({ ...this }),
      });
    }
    save = vi.fn(async () => this);
    updatePlanSettings = vi.fn();
  }
  MockTenant.findById = vi.fn();
  MockTenant.findByIdAndDelete = vi.fn();
  MockTenant.findOne = vi.fn();
  MockTenant.find = vi.fn();
  MockTenant.countDocuments = vi.fn();
  return { default: MockTenant };
});

vi.mock("../modules/users/user.model.js", () => modelFactory());
vi.mock("../modules/users/branch.model.js", () => modelFactory());
vi.mock("../modules/users/role.model.js", () => modelFactory());
vi.mock("../modules/patients/patient.model.js", () => modelFactory());
vi.mock("../modules/appointments/appointment.model.js", () => modelFactory());
vi.mock("../modules/billing/invoice.model.js", () => modelFactory());
vi.mock("../modules/billing/commission.model.js", () => modelFactory());
vi.mock("../modules/site/tenant/subscription.model.js", () => modelFactory());
vi.mock("../modules/emr/clinicalNote.model.js", () => modelFactory());
vi.mock("../modules/emr/consent.model.js", () => modelFactory());
vi.mock("../modules/emr/dentalChart.model.js", () => modelFactory());
vi.mock("../modules/emr/treatmentPlan.model.js", () => modelFactory());
vi.mock("../modules/emr/prescription.model.js", () => modelFactory());
vi.mock("../modules/emr/attachment.model.js", () => modelFactory());
vi.mock("../modules/patients/wallet.model.js", () => modelFactory());
vi.mock("../modules/patients/installment.model.js", () => modelFactory());
vi.mock("../modules/chat/message.model.js", () => modelFactory());
vi.mock("../modules/chat/channelRead.model.js", () => modelFactory());
vi.mock("../modules/inventory/inventory.model.js", () => modelFactory());
vi.mock("../modules/accounting/ownerDrawing.model.js", () => modelFactory());
vi.mock("../modules/accounting/expense.model.js", () => modelFactory());
vi.mock("../modules/accounting/dayClose.model.js", () => modelFactory());
vi.mock("../modules/accounting/journalEntry.model.js", () => modelFactory());
vi.mock("../modules/site/errorLog/errorLog.model.js", () => modelFactory());
vi.mock("../modules/whatsapp/whatsappSetting.model.js", () => modelFactory());
vi.mock("../modules/platform/plan.model.js", () => {
  class MockPlan {
    static findOne = vi.fn();
  }
  return { default: MockPlan };
});
vi.mock("../modules/platform/platformSetting.model.js", () => {
  class MockPlatformSetting {
    static findOne = vi.fn();
  }
  return { default: MockPlatformSetting };
});

import { withTransaction } from "../core/transaction.js";
import Counter from "../core/counters.js";
import { cacheDelPattern, invalidateTenant, invalidateTenantRoles } from "../utils/cache.js";
import { getPlanPrice } from "../modules/site/subscription/subscription.service.js";
import { unlink } from "node:fs/promises";
import {
  archiveTenant,
  createTenant,
  deleteTenant,
  getTenantById,
  getTenantStats,
  listTenants,
  suspendTenant,
  activateTenant,
  updateTenant,
} from "../modules/site/tenant/tenant.service.js";
import Plan from "../modules/platform/plan.model.js";
import PlatformSetting from "../modules/platform/platformSetting.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import User from "../modules/users/user.model.js";
import Branch from "../modules/users/branch.model.js";
import Role from "../modules/users/role.model.js";
import Patient from "../modules/patients/patient.model.js";
import Appointment from "../modules/appointments/appointment.model.js";
import Invoice from "../modules/billing/invoice.model.js";
import Commission from "../modules/billing/commission.model.js";
import Subscription from "../modules/site/tenant/subscription.model.js";
import ClinicalNote from "../modules/emr/clinicalNote.model.js";
import Consent from "../modules/emr/consent.model.js";
import DentalChart from "../modules/emr/dentalChart.model.js";
import MedicalAttachment from "../modules/emr/attachment.model.js";
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
import Prescription from "../modules/emr/prescription.model.js";
import Wallet from "../modules/patients/wallet.model.js";
import Installment from "../modules/patients/installment.model.js";
import Message from "../modules/chat/message.model.js";
import ChannelRead from "../modules/chat/channelRead.model.js";
import Inventory from "../modules/inventory/inventory.model.js";
import OwnerDrawing from "../modules/accounting/ownerDrawing.model.js";
import Expense from "../modules/accounting/expense.model.js";
import DayClose from "../modules/accounting/dayClose.model.js";
import JournalEntry from "../modules/accounting/journalEntry.model.js";
import ErrorLog from "../modules/site/errorLog/errorLog.model.js";
import WhatsappSetting from "../modules/whatsapp/whatsappSetting.model.js";

const scopedModels = [
  User, Branch, Role, Patient, Appointment, Invoice, Subscription,
  ClinicalNote, Consent, DentalChart, TreatmentPlan, Prescription,
  MedicalAttachment, Wallet, Installment, Message, ChannelRead, Inventory,
  Commission, OwnerDrawing, Expense, DayClose, JournalEntry, ErrorLog,
  WhatsappSetting,
];

describe("deleteTenant", () => {
  let tenantId;

  beforeEach(() => {
    tenantId = "t1";
    vi.clearAllMocks();
    vi.mocked(Tenant.findById).mockResolvedValue({ _id: tenantId, name: "Clinic One" });
    vi.mocked(withTransaction).mockImplementation(async (fn) => {
      const session = { id: "tx-session" };
      await fn(session);
    });
    vi.mocked(Tenant.findByIdAndDelete).mockResolvedValue({});
    // The service reads attachment filenames before wiping them from disk.
    MedicalAttachment.find.mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
  });

  it("runs the exhaustive delete inside a single MongoDB transaction", async () => {
    await deleteTenant(tenantId);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    const callback = vi.mocked(withTransaction).mock.calls[0][0];
    expect(typeof callback).toBe("function");
  });

  it("deletes every tenant-scoped collection plus the tenant itself", async () => {
    await deleteTenant(tenantId);

    for (const Model of scopedModels) {
      expect(Model.deleteMany).toHaveBeenCalledTimes(1);
      expect(Model.deleteMany).toHaveBeenCalledWith(
        { tenant: tenantId },
        { session: expect.anything() },
      );
    }

    expect(Counter.deleteMany).toHaveBeenCalledWith(
      { _id: expect.any(RegExp) },
      { session: expect.anything() },
    );
    expect(Counter.deleteMany).toHaveBeenCalledWith(
      { _id: new RegExp(`:${tenantId}$`) },
      { session: expect.anything() },
    );

    expect(Tenant.findByIdAndDelete).toHaveBeenCalledTimes(1);
    expect(Tenant.findByIdAndDelete).toHaveBeenCalledWith(
      tenantId,
      { session: expect.anything() },
    );
    expect(MedicalAttachment.find).toHaveBeenCalledWith({ tenant: tenantId });
  });

  it("unlinks encrypted attachment files after the records are wiped", async () => {
    vi.mocked(unlink).mockResolvedValue();
    MedicalAttachment.find.mockReturnValue({
      select: () => ({
        lean: vi.fn().mockResolvedValue([
          { filename: "x-ray-1.pdf" },
          { filename: "../escape.pdf" },
        ]),
      }),
    });

    await deleteTenant(tenantId);

    // The filename is basename-guarded, so "../escape.pdf" collides with a
    // literal "escape.pdf" rather than climbing out of the uploads root.
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining("x-ray-1.pdf"));
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining("x-ray-1.pdf.enc"));
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining("escape.pdf"));
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining("escape.pdf.enc"));
  });

  it("invalidates tenant cache, role cache and permission keys after the transaction", async () => {
    await deleteTenant(tenantId);

    expect(invalidateTenant).toHaveBeenCalledWith(tenantId);
    expect(invalidateTenantRoles).toHaveBeenCalledWith(tenantId);
    expect(cacheDelPattern).toHaveBeenCalledWith(`permission:*${tenantId}*`);
  });

  it("throws notFound and touches nothing when the tenant does not exist", async () => {
    vi.mocked(Tenant.findById).mockResolvedValue(null);

    await expect(deleteTenant(tenantId)).rejects.toMatchObject({ statusCode: 404 });

    expect(withTransaction).not.toHaveBeenCalled();
    for (const Model of scopedModels) {
      expect(Model.deleteMany).not.toHaveBeenCalled();
    }
    expect(MedicalAttachment.find).not.toHaveBeenCalled();
    expect(Tenant.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

describe("listTenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Tenant.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: vi.fn().mockResolvedValue([]) }) }) }),
    });
    Tenant.countDocuments.mockResolvedValue(0);
  });

  it("returns empty pagination when no filters and no tenants", async () => {
    const result = await listTenants({ page: 1, limit: 10 });
    expect(Tenant.find).toHaveBeenCalledWith({});
    expect(result.pagination.totalPages).toBe(0);
    expect(result.tenants).toEqual([]);
  });

  it("applies status, plan and regex search filters", async () => {
    const lean = vi.fn().mockResolvedValue([{ _id: "t1", name: "Bright Smile", branchesCount: 0, usersCount: 0 }]);
    Tenant.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }),
    });
    Branch.aggregate.mockResolvedValue([{ _id: "t1", count: 2 }]);
    User.aggregate.mockResolvedValue([{ _id: "t1", count: 3 }]);
    Tenant.countDocuments.mockResolvedValue(1);

    const result = await listTenants({ page: 1, limit: 10, status: "active", plan: "pro", search: "bright" });
    expect(Tenant.find).toHaveBeenCalledWith({
      status: "active",
      plan: "pro",
      $or: [
        { name: expect.any(Object) },
        { email: expect.any(Object) },
      ],
    });
    expect(result.tenants[0].branchesCount).toBe(2);
    expect(result.tenants[0].usersCount).toBe(3);
    expect(result.pagination.total).toBe(1);
  });

  it("skips aggregation when there are zero tenants", async () => {
    await listTenants({ page: 1, limit: 10 });
    expect(Branch.aggregate).not.toHaveBeenCalled();
    expect(User.aggregate).not.toHaveBeenCalled();
  });

  it("restricts trial tenants whose trial ends within the given window", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    Tenant.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }),
    });
    Tenant.countDocuments.mockResolvedValue(0);

    await listTenants({ page: 1, limit: 10, trialExpiring: "7" });

    const call = Tenant.find.mock.calls[0][0];
    expect(call.status).toBe("trial");
    expect(call.trialEndsAt.$gte).toBeInstanceOf(Date);
    expect(call.trialEndsAt.$lte).toBeInstanceOf(Date);
    const windowMs = call.trialEndsAt.$lte.getTime() - call.trialEndsAt.$gte.getTime();
    expect(windowMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("excludes tenants that have any user or branch when dormant is requested", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    Tenant.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }),
    });
    Tenant.countDocuments.mockResolvedValue(0);
    User.distinct.mockResolvedValue(["t-used-1"]);
    Branch.distinct.mockResolvedValue(["t-used-1", "t-used-2"]);

    await listTenants({ page: 1, limit: 10, dormant: "true" });

    const call = Tenant.find.mock.calls[0][0];
    expect(User.distinct).toHaveBeenCalledWith("tenant");
    expect(Branch.distinct).toHaveBeenCalledWith("tenant");
    expect(call._id).toEqual({
      $nin: expect.arrayContaining(["t-used-1", "t-used-2"]),
    });
  });

  it("does not apply the dormant filter when the flag is falsy", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    Tenant.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }),
    });
    Tenant.countDocuments.mockResolvedValue(0);

    await listTenants({ page: 1, limit: 10 });

    expect(User.distinct).not.toHaveBeenCalled();
    expect(Branch.distinct).not.toHaveBeenCalled();
    expect(Tenant.find).toHaveBeenCalledWith({});
  });
});

describe("getTenantById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "t1", name: "Clinic One" }) });
    Branch.countDocuments.mockResolvedValue(1);
    User.countDocuments.mockResolvedValue(2);
    Patient.countDocuments.mockResolvedValue(3);
    Appointment.countDocuments.mockResolvedValue(4);
  });

  it("returns the tenant with usage counts", async () => {
    const result = await getTenantById("t1");
    expect(result.branchesCount).toBe(1);
    expect(result.usersCount).toBe(2);
    expect(result.patientsCount).toBe(3);
    expect(result.appointmentsCount).toBe(4);
  });

  it("throws notFound when the id is unknown", async () => {
    Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    await expect(getTenantById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("getTenantStats", () => {
  const roleDoc = { _id: "dr1" };
  beforeEach(() => {
    vi.clearAllMocks();
    Tenant.findById.mockResolvedValue({ _id: "t1", settings: { doctors: 5 }, status: "active" });
    Role.find.mockReturnValue({ select: () => ({ lean: vi.fn().mockResolvedValue([roleDoc]) }) });
    Branch.countDocuments.mockResolvedValue(1);
    User.countDocuments.mockResolvedValue(7);
    Patient.countDocuments.mockResolvedValue(10);
    Appointment.countDocuments.mockResolvedValue(12);
    Invoice.aggregate.mockResolvedValue([{ total: 4200 }]);
  });

  it("computes doctor, patient, appointment and revenue totals", async () => {
    const stats = await getTenantStats("t1");
    expect(stats.doctorsCount).toBe(7);
    expect(stats.totalRevenue).toBe(4200);
    expect(stats.planLimits).toEqual({ doctors: 5 });
  });

  it("returns zero revenue when no invoices exist", async () => {
    Invoice.aggregate.mockResolvedValue([]);
    const stats = await getTenantStats("t1");
    expect(stats.totalRevenue).toBe(0);
  });

  it("throws notFound for a missing tenant", async () => {
    Tenant.findById.mockResolvedValue(null);
    await expect(getTenantStats("nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("archiveTenant / suspendTenant / activateTenant", () => {
  it("archives a tenant and invalidates its cache", async () => {
    vi.clearAllMocks();
    const tenant = new Tenant({ status: "trial" });
    Tenant.findById.mockResolvedValue(tenant);
    await archiveTenant("t1");
    expect(tenant.status).toBe("archived");
    expect(tenant.isActive).toBe(false);
    expect(tenant.save).toHaveBeenCalled();
    expect(invalidateTenant).toHaveBeenCalledWith("t1");
  });

  it("suspends a tenant", async () => {
    vi.clearAllMocks();
    const tenant = new Tenant({ status: "active" });
    Tenant.findById.mockResolvedValue(tenant);
    await suspendTenant("t1");
    expect(tenant.status).toBe("suspended");
    expect(tenant.isActive).toBe(false);
    expect(invalidateTenant).toHaveBeenCalledWith("t1");
  });

  it("activates a tenant", async () => {
    vi.clearAllMocks();
    const tenant = new Tenant({ status: "trial" });
    Tenant.findById.mockResolvedValue(tenant);
    await activateTenant("t1");
    expect(tenant.status).toBe("active");
    expect(tenant.isActive).toBe(true);
    expect(invalidateTenant).toHaveBeenCalledWith("t1");
  });

  it("throws notFound when archiving an unknown tenant", async () => {
    vi.clearAllMocks();
    Tenant.findById.mockResolvedValue(null);
    await expect(archiveTenant("nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("createTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Tenant.findOne.mockResolvedValue(null);
    User.findOne.mockResolvedValue(null);
    Plan.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ key: "basic", price: 99, billingCycle: "monthly" }) });
    PlatformSetting.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ trialDays: 14, maxTenants: 1000 }) });
    Tenant.countDocuments.mockResolvedValue(1);
    Role.findOne.mockImplementation(() => ({ session: () => ({ lean: vi.fn().mockResolvedValue(null) }) }));
    withTransaction.mockImplementation(async (fn) => {
      const session = { id: "tx-session" };
      return fn(session);
    });
    Branch.create.mockResolvedValue([{ _id: "b1" }]);
    Counter.updateOne.mockResolvedValue({});
    Role.create.mockResolvedValue([{ _id: "r1", toObject: () => ({ _id: "r1" }) }]);
    User.create.mockResolvedValue([{ _id: "u1" }]);
    Subscription.create.mockResolvedValue([{}]);
  });

  it("resolves a unique slug on collision", async () => {
    Tenant.findOne.mockImplementation(async ({ email, slug }) => {
      if (email) return null;
      if (slug === "bright-clinic" || slug === "bright-clinic-1") return { _id: "occupied" };
      return null;
    });

    const result = await createTenant({ name: "Bright Clinic", email: "owner@bright.com" });
    expect(result.slug).toBe("bright-clinic-2");
    expect(result.branchesCount).toBe(1);
    // encrypt field must never leak out
    expect(result.encryption).toBeUndefined();
  });

  it("throws conflict when the email belongs to an existing tenant", async () => {
    Tenant.findOne.mockImplementation(async ({ email }) => (email ? { _id: "other" } : null));
    await expect(createTenant({ name: "Clinic", email: "dup@x.com" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws conflict when the email belongs to an existing user", async () => {
    User.findOne.mockResolvedValue({ _id: "u9" });
    await expect(createTenant({ name: "Clinic", email: "dup-user@x.com" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("enforces the maximum tenant cap", async () => {
    PlatformSetting.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ trialDays: 14, maxTenants: 1 }) });
    Tenant.countDocuments.mockResolvedValue(1);
    await expect(createTenant({ name: "Clinic", email: "owner@x.com" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("creates an active tenant with a yearly subscription period", async () => {
    Plan.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ key: "enterprise", price: 999, billingCycle: "yearly" }) });
    const result = await createTenant({
      name: "Yearly Ltd",
      email: "y@x.com",
      status: "active",
      plan: "enterprise",
    });
    expect(result.status).toBe("active");
    expect(result.subscriptionEndsAt).toBeInstanceOf(Date);
    expect(result.isActive).toBe(true);
    expect(Branch.create).toHaveBeenCalled();
    expect(Counter.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      { $setOnInsert: { seq: 1 } },
      expect.any(Object),
    );
  });

  it("falls back to the default price when the plan has no price", async () => {
    Plan.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ key: "basic", billingCycle: "monthly" }) });
    const result = await createTenant({ name: "NoPrice Co", email: "np@x.com" });
    expect(result.status).toBe("trial");
    expect(Subscription.create).toHaveBeenCalled();
  });
});

describe("updateTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "trial", plan: "basic" });
    tenant.save._id = "t1";
    Tenant.findById.mockResolvedValue(tenant);
    Tenant.findOne.mockResolvedValue(null);
  });

  it("updates basic fields and invalidates the cached tenant", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "trial" });
    Tenant.findById.mockResolvedValue(tenant);
    const result = await updateTenant("t1", { name: "Renamed", phone: "+201" });
    expect(tenant.name).toBe("Renamed");
    expect(tenant.phone).toBe("+201");
    expect(invalidateTenant).toHaveBeenCalledWith("t1");
    expect(result).toBe(tenant);
  });

  it("throws conflict when the new email is already taken", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com" });
    Tenant.findById.mockResolvedValue(tenant);
    Tenant.findOne.mockResolvedValue({ _id: "other" });
    await expect(updateTenant("t1", { email: "taken@x.com" })).rejects.toMatchObject({ statusCode: 409 });
    expect(Tenant.findOne).toHaveBeenCalledWith({ email: "taken@x.com", _id: { $ne: "t1" } });
  });

  it("syncs the subscription when the plan changes", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "active", plan: "basic" });
    Tenant.findById.mockResolvedValue(tenant);
    Plan.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ key: "pro", price: 199, billingCycle: "monthly" }) });
    const subscription = { plan: "basic", billingCycle: "monthly", save: vi.fn(async () => {}) };
    Subscription.findOne.mockResolvedValue(subscription);
    const result = await updateTenant("t1", { plan: "pro" });
    expect(subscription.plan).toBe("pro");
    expect(getPlanPrice).toHaveBeenCalled();
    expect(subscription.save).toHaveBeenCalled();
    expect(result).toBe(tenant);
  });

  it("reprices to the default when no subscription row exists on plan change", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "active", plan: "basic" });
    Tenant.findById.mockResolvedValue(tenant);
    Plan.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ key: "pro", billingCycle: "yearly" }) });
    Subscription.findOne.mockResolvedValue(null);
    await updateTenant("t1", { plan: "pro" });
    expect(Subscription.findOne).toHaveBeenCalledWith({ tenant: "t1" });
  });

  it("transitions active with no end-of-period into a fresh month", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "trial", plan: "basic", subscriptionEndsAt: null });
    Tenant.findById.mockResolvedValue(tenant);
    const result = await updateTenant("t1", { status: "active" });
    expect(result.status).toBe("active");
    expect(result.isActive).toBe(true);
    expect(result.subscriptionEndsAt).toBeInstanceOf(Date);
    expect(result.trialEndsAt).toBeNull();
  });

  it("sets a fresh trial window for a trial status", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "active" });
    Tenant.findById.mockResolvedValue(tenant);
    PlatformSetting.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ trialDays: 21 }) });
    const result = await updateTenant("t1", { status: "trial" });
    expect(result.status).toBe("trial");
    expect(result.subscriptionEndsAt).toBeNull();
    expect(result.trialEndsAt).toBeInstanceOf(Date);
  });

  it("deactivates a suspended tenant", async () => {
    const tenant = new Tenant({ _id: "t1", email: "old@x.com", status: "active" });
    Tenant.findById.mockResolvedValue(tenant);
    const result = await updateTenant("t1", { status: "suspended" });
    expect(result.status).toBe("suspended");
    expect(result.isActive).toBe(false);
  });
});
