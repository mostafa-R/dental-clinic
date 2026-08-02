import { beforeEach, describe, expect, it, vi } from "vitest";

const { modelFactory } = vi.hoisted(() => ({
  modelFactory: () => {
    class MockModel {}
    MockModel.deleteMany = vi.fn();
    MockModel.findByIdAndDelete = vi.fn();
    return { default: MockModel };
  },
}));

vi.mock("../core/transaction.js", () => ({
  withTransaction: vi.fn(),
}));

vi.mock("../core/counters.js", () => ({ default: { deleteMany: vi.fn() } }));

vi.mock("../utils/cache.js", () => ({
  cacheDelPattern: vi.fn(),
  invalidateTenant: vi.fn(),
  invalidateTenantRoles: vi.fn(),
}));

vi.mock("../modules/site/tenant/tenant.model.js", () => {
  class MockTenant {}
  MockTenant.findById = vi.fn();
  MockTenant.findByIdAndDelete = vi.fn();
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
vi.mock("../modules/emr/dentalChart.model.js", () => modelFactory());
vi.mock("../modules/emr/treatmentPlan.model.js", () => modelFactory());
vi.mock("../modules/emr/prescription.model.js", () => modelFactory());
vi.mock("../modules/patients/wallet.model.js", () => modelFactory());
vi.mock("../modules/patients/installment.model.js", () => modelFactory());
vi.mock("../modules/chat/message.model.js", () => modelFactory());
vi.mock("../modules/chat/channelRead.model.js", () => modelFactory());
vi.mock("../modules/inventory/inventory.model.js", () => modelFactory());
vi.mock("../modules/accounting/ownerDrawing.model.js", () => modelFactory());
vi.mock("../modules/accounting/expense.model.js", () => modelFactory());
vi.mock("../modules/site/errorLog/errorLog.model.js", () => modelFactory());
vi.mock("../modules/whatsapp/whatsappSetting.model.js", () => modelFactory());

import { withTransaction } from "../core/transaction.js";
import Counter from "../core/counters.js";
import { cacheDelPattern, invalidateTenant, invalidateTenantRoles } from "../utils/cache.js";
import { deleteTenant } from "../modules/site/tenant/tenant.service.js";
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
import DentalChart from "../modules/emr/dentalChart.model.js";
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
import Prescription from "../modules/emr/prescription.model.js";
import Wallet from "../modules/patients/wallet.model.js";
import Installment from "../modules/patients/installment.model.js";
import Message from "../modules/chat/message.model.js";
import ChannelRead from "../modules/chat/channelRead.model.js";
import Inventory from "../modules/inventory/inventory.model.js";
import OwnerDrawing from "../modules/accounting/ownerDrawing.model.js";
import Expense from "../modules/accounting/expense.model.js";
import ErrorLog from "../modules/site/errorLog/errorLog.model.js";
import WhatsappSetting from "../modules/whatsapp/whatsappSetting.model.js";

const scopedModels = [
  User, Branch, Role, Patient, Appointment, Invoice, Subscription,
  ClinicalNote, DentalChart, TreatmentPlan, Prescription, Wallet, Installment,
  Message, ChannelRead, Inventory, Commission, OwnerDrawing, Expense,
  ErrorLog, WhatsappSetting,
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
    expect(Tenant.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
