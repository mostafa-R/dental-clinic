/**
 * Real-MongoDB integration tests for the Billing module's core workflows.
 *
 * Exercises the actual service layer (createInvoice / applyInvoicePayment /
 * addPayment / refundPayment / voidInvoice / getInvoiceAging) against a real
 * replica-capable MongoDB, verifying the money, journal, wallet, commission
 * and status invariants end-to-end:
 *  - atomic invoice numbering + counter rollback
 *  - partial -> paid transitions across multiple payment methods
 *  - overpayment excess auto-credited to the patient wallet
 *  - balanced double-entry journals for every financial event
 *  - commission accrual per item on full payment (BR-BL-02)
 *  - refunds adjusting commissions and status
 *  - voiding reversing wallet debits and voiding commissions
 *  - aging buckets for unpaid/partial invoices
 *
 * Uses a DEDICATED database (dental_os_billing_test) so it never collides with
 * the shared dental_os_test used by other real-DB suites in the same process.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../config/redis.js', () => ({ getRedis: vi.fn(() => null) }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn(),
}));
vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(() => null), cacheTenant: vi.fn(), invalidateTenant: vi.fn(),
  getCachedRole: vi.fn(() => null), cacheRole: vi.fn(),
}));
vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}), emitToTenant: vi.fn(() => {}),
}));

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

const billingDbUri = process.env.TEST_MONGO_URI
  ? `${process.env.TEST_MONGO_URI.replace(/\/[^/]*$/, '')}/dental_os_billing_test`
  : 'mongodb://127.0.0.1:27017/dental_os_billing_test';
await mongoose.connect(billingDbUri);

// Multi-document transactions (invoice numbering + creation atomicity) require
// a replica set; on a standalone Mongo the whole suite is skipped and covered
// in CI, which runs a single-node replica set.
let supportsTransactions = false;
try {
  await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
  supportsTransactions = true;
} catch {
  supportsTransactions = false;
}

describe.skipIf(!supportsTransactions)('Billing workflow (real DB)', () => {
  let Tenant, Branch, Patient, User, Appointment, Invoice, Wallet, Commission, JournalEntry, Counter;
  let service;
  let tenantId, branchId, patientId, doctorId, otherBranchId;
  let phoneSeq = 0;

  beforeAll(async () => {
    await mongoose.connect(billingDbUri);

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    User = (await import('../modules/users/user.model.js')).default;
    Appointment = (await import('../modules/appointments/appointment.model.js')).default;
    Invoice = (await import('../modules/billing/invoice.model.js')).default;
    Wallet = (await import('../modules/patients/wallet.model.js')).default;
    Commission = (await import('../modules/billing/commission.model.js')).default;
    JournalEntry = (await import('../modules/accounting/journalEntry.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    service = await import('../modules/billing/invoice.service.js');

    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      User.deleteMany({}), Appointment.deleteMany({}), Invoice.deleteMany({}),
      Wallet.deleteMany({}), Commission.deleteMany({}), JournalEntry.deleteMany({}),
      Counter.deleteMany({}),
    ]);

    const tenant = await Tenant.create({
      name: 'Billing Test Clinic', email: 'billing@test.com', slug: 'billing-test-clinic',
      plan: 'professional', status: 'active', isActive: true,
    });
    tenantId = tenant._id;

    const branch = await Branch.create({
      tenant: tenantId, name: 'Main Branch', address: '1 Main St', phone: '+1000000001',
    });
    branchId = branch._id;

    otherBranchId = (
      await Branch.create({ tenant: tenantId, name: 'Other Branch', address: '2 Other St', phone: '+1000000002' })
    )._id;

    const patient = await Patient.create({
      tenant: tenantId, branch: branchId, firstName: 'Bill', lastName: 'Pay', phone: '+1999000001',
    });
    patientId = patient._id;

    const doctor = await User.create({
      tenant: tenantId, name: 'Dr Komi', email: 'komi@test.com', username: 'komi',
      password: 'HashedPass123!', roleId: new mongoose.Types.ObjectId(), isDoctor: true,
      commissionRate: 10, branch: branchId,
    });
    doctorId = doctor._id;
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      User.deleteMany({}), Appointment.deleteMany({}), Invoice.deleteMany({}),
      Wallet.deleteMany({}), Commission.deleteMany({}), JournalEntry.deleteMany({}),
      Counter.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  const phone = () => `+1999${String(phoneSeq++).padStart(6, '0')}`;

  let apptOffset = 0;
  async function makeAppointment(forPatient = patientId) {
    apptOffset += 1;
    const start = new Date(Date.now() + apptOffset * 3600 * 1000);
    return Appointment.create({
      tenant: tenantId, branch: branchId, patient: forPatient, doctor: doctorId,
      start, end: new Date(start.getTime() + 30 * 60 * 1000), status: 'scheduled', chair: 'A1',
    });
  }

  describe('createInvoice', () => {
    it('creates an invoice with an atomically-assigned number and computed total', async () => {
      const appt = await makeAppointment();
      const invoice = await service.createInvoice({
        data: {
          patient: String(patientId), appointment: String(appt._id),
          items: [
            { description: 'Filling', quantity: 1, unitPrice: 100, discount: 10 },
            { description: 'Cleaning', quantity: 2, unitPrice: 50 },
          ],
          tax: 15,
        },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });

      expect(invoice.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);
      // subtotal = 90 + 100 = 190 ; discount 0 ; tax 15 => total 205
      expect(invoice.subtotal).toBe(190);
      expect(invoice.total).toBe(205);
      expect(invoice.status).toBe('unpaid');
      expect(String(invoice.branch)).toBe(String(branchId));
    });

    it('rejects an appointment that belongs to another branch', async () => {
      const pOther = await Patient.create({
        tenant: tenantId, branch: otherBranchId, firstName: 'Other', lastName: 'Patient', phone: phone(),
      });
      const appt = await Appointment.create({
        tenant: tenantId, branch: otherBranchId, patient: pOther._id, doctor: doctorId,
        start: new Date(Date.now() + 2 * 3600 * 1000),
        end: new Date(Date.now() + 2.5 * 3600 * 1000), status: 'scheduled', chair: 'B1',
      });
      await expect(
        service.createInvoice({
          data: { patient: String(patientId), appointment: String(appt._id), items: [{ description: 'X', quantity: 1, unitPrice: 10 }] },
          branch: branchId, tenant: tenantId, userId: doctorId,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('payments (addPayment)', () => {
    it('records a partial payment, posts a balanced journal, status=partial', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'Consult', quantity: 1, unitPrice: 100 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });

      const paid = await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 40, method: 'cash', userId: doctorId,
      });

      expect(paid.status).toBe('partial');
      expect(paid.paidAmount).toBe(40);

      const journals = await JournalEntry.find({ sourceId: inv._id, sourceModel: 'Invoice', sourceType: 'payment' });
      expect(journals.length).toBe(1);
      const entry = journals[0];
      const sumD = entry.lines.reduce((s, l) => s + l.debit, 0);
      const sumC = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(sumD - sumC)).toBe(0);
      expect(entry.totalDebit).toBe(40);

      // Accrual model: issuing the invoice recognized revenue via AR and the
      // payment cleared the receivable (Dr cash / Cr accounts_receivable) —
      // revenue must NOT be credited again on collection.
      const revenueLines = entry.lines.filter((l) => l.account === 'revenue');
      expect(revenueLines.length).toBe(0);
      expect(entry.lines.some((l) => l.account === 'accounts_receivable')).toBe(true);
    });

    it('overpayment excess is auto-credited to the patient wallet', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'Consult2', quantity: 1, unitPrice: 100 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });

      const paid = await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 130, method: 'cash', userId: doctorId,
      });

      expect(paid.status).toBe('paid');
      expect(paid.paidAmount).toBe(100);

      const wallet = await Wallet.findOne({ patient: patientId, branch: branchId });
      expect(wallet).toBeDefined();
      expect(wallet.balance).toBe(30);
    });

    it('is deduplicated by an idempotency key', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'Consult3', quantity: 1, unitPrice: 50 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      const key = `dup-${String(inv._id)}`;

      const r1 = await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 50, method: 'cash', idempotencyKey: key, userId: doctorId,
      });
      const r2 = await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 50, method: 'cash', idempotencyKey: key, userId: doctorId,
      });

      expect(r1.paidAmount).toBe(50);
      expect(r2.paidAmount).toBe(50); // not double-charged
      const payments = (await Invoice.findById(inv._id)).payments;
      expect(payments.filter((p) => p.idempotencyKey === key).length).toBe(1);

      // Exactly one payment journal regardless of the idempotent replay, and a
      // single issuance entry from createInvoice.
      const paymentJournals = await JournalEntry.find({ sourceId: inv._id, sourceType: 'payment' });
      expect(paymentJournals.length).toBe(1); // no duplicate journal
      const issuance = await JournalEntry.find({ sourceId: inv._id, sourceType: 'invoice' });
      expect(issuance.length).toBe(1); // revenue recognized once at issue
    });

    it('rejects a payment on an invoice from another branch (404)', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'Clean4', quantity: 1, unitPrice: 20 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      await expect(
        service.addPayment(String(inv._id), { branch: otherBranchId }, {
          amount: 10, method: 'cash', userId: doctorId,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('creates exactly one commission per line item on full payment, excluding discounts and tax', async () => {
      const appt = await makeAppointment();
      const inv = await service.createInvoice({
        data: {
          patient: String(patientId), appointment: String(appt._id),
          items: [
            { description: 'Filling', quantity: 1, unitPrice: 100, discount: 10 }, // net 90
            { description: 'Cleaning', quantity: 2, unitPrice: 50, tax: 5 },       // net 100
          ],
          tax: 15,
        },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });

      await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 210, method: 'cash', userId: doctorId,
      });

      const commissions = await Commission.find({ invoice: inv._id });
      expect(commissions.length).toBe(2);
      const byName = Object.fromEntries(commissions.map((c) => [c.procedureName, c]));
      // Pool = 90 + 100 = 190 ; no invoice-level discount => factor 1.
      expect(byName['Filling'].baseAmount).toBe(90);
      expect(byName['Cleaning'].baseAmount).toBe(100);
      expect(byName['Filling'].amount).toBe(9);
      expect(byName['Cleaning'].amount).toBe(10);
      expect(byName['Filling'].status).toBe('pending');
    });
  });

  describe('refund (refundPayment)', () => {
    it('refunds reduce paidAmount and re-derive status; journals stay balanced', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'RefundMe', quantity: 1, unitPrice: 100 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 100, method: 'cash', userId: doctorId,
      });
      expect((await Invoice.findById(inv._id)).status).toBe('paid');

      const refunded = await service.refundPayment(String(inv._id), { branch: branchId }, {
        amount: 40, method: 'cash', userId: doctorId,
      });
      expect(refunded.paidAmount).toBe(60);
      expect(refunded.status).toBe('partial');

      const journals = await JournalEntry.find({ sourceId: inv._id, sourceType: 'refund' });
      expect(journals.length).toBe(1);
      const j = journals[0];
      const sumD = j.lines.reduce((s, l) => s + l.debit, 0);
      const sumC = j.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(sumD - sumC)).toBe(0);
      expect(sumD).toBe(40);
    });

    it('rejects a refund larger than the paid amount', async () => {
      const inv = await service.createInvoice({
        data: { patient: String(patientId), items: [{ description: 'NoRefund', quantity: 1, unitPrice: 20 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      await service.addPayment(String(inv._id), { branch: branchId }, {
        amount: 20, method: 'cash', userId: doctorId,
      });
      await expect(
        service.refundPayment(String(inv._id), { branch: branchId }, { amount: 25, method: 'cash', userId: doctorId }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('scales down commissions and voids them on a full refund', async () => {
      const appt = await makeAppointment();
      const inv = await service.createInvoice({
        data: { patient: String(patientId), appointment: String(appt._id), items: [{ description: 'CommRefund', quantity: 1, unitPrice: 100 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      await service.addPayment(String(inv._id), { branch: branchId }, { amount: 100, method: 'cash', userId: doctorId });
      let commissions = await Commission.find({ invoice: inv._id });
      expect(commissions.length).toBe(1);
      expect(commissions[0].status).toBe('pending');

      // Half refund -> commission baseAmount scales by 0.5
      await service.refundPayment(String(inv._id), { branch: branchId }, { amount: 50, method: 'cash', userId: doctorId });
      let cm = await Commission.findOne({ invoice: inv._id });
      expect(cm.baseAmount).toBe(50);
      expect(cm.amount).toBe(5);

      // Second 100% refund of remaining 50 -> void
      await service.refundPayment(String(inv._id), { branch: branchId }, { amount: 50, method: 'cash', userId: doctorId });
      cm = await Commission.findOne({ invoice: inv._id });
      expect(cm.status).toBe('void');
    });
  });

  describe('void (voidInvoice)', () => {
    it('voids the invoice, reaches the "void" status, and voids commissions', async () => {
      // Dedicated patient so wallet assertions are not polluted by earlier tests.
      const { addTransaction } = await import('../modules/patients/wallet.service.js');
      const newPatient = await Patient.create({
        tenant: tenantId, branch: branchId, firstName: 'Void', lastName: 'Wallet', phone: '+1777000001',
      });
      const patient = await mongoose.model('Patient').findById(newPatient._id);
      await addTransaction(patient, {
        type: 'credit', amount: 200, reference: 'topup', description: 'Test top-up',
      }, doctorId);
      const funded = await Wallet.findOne({ patient: newPatient._id });
      expect(funded.balance).toBeCloseTo(200, 2);

      const appt = await makeAppointment(newPatient._id);
      const inv = await service.createInvoice({
        data: { patient: String(newPatient._id), appointment: String(appt._id), items: [{ description: 'VoidMe', quantity: 1, unitPrice: 60 }] },
        branch: branchId, tenant: tenantId, userId: doctorId,
      });
      await service.addPayment(String(inv._id), { branch: branchId }, { amount: 60, method: 'wallet', userId: doctorId });
      let commissions = await Commission.find({ invoice: inv._id });
      expect(commissions.length).toBe(1);

      const voided = await service.voidInvoice(String(inv._id), { branch: branchId }, { reason: 'test', userId: doctorId });
      expect(voided.status).toBe('void');

      commissions = await Commission.find({ invoice: inv._id });
      expect(commissions.every((c) => c.status === 'void')).toBe(true);

      // The wallet debit must be reversed: the 60 wallet payment is credited
      // back, restoring the patient's balance to the funded amount.
      const walletAfter = await Wallet.findOne({ patient: newPatient._id });
      expect(walletAfter.balance).toBeCloseTo(funded.balance, 2);

      // Payment attempts on a void invoice are rejected
      await expect(
        service.addPayment(String(inv._id), { branch: branchId }, { amount: 10, method: 'cash', userId: doctorId }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('aging (getInvoiceAging)', () => {
    it('buckets unpaid/partial invoices by overdue age', async () => {
      const now = Date.now();
      const baseline = (await service.getInvoiceAging({ branch: branchId })).aging;
      const delta = (name) => ({
        count: aging[name].count - baseline[name].count,
        amount: aging[name].amount - baseline[name].amount,
      });
      const mk = async (unitPrice, dueDate, amount, method) => {
        const inv = await service.createInvoice({
          data: {
            patient: String(patientId), items: [{ description: 'Aging', quantity: 1, unitPrice }],
            dueDate: dueDate ? new Date(dueDate) : undefined,
          },
          branch: branchId, tenant: tenantId, userId: doctorId,
        });
        if (amount) {
          await service.addPayment(String(inv._id), { branch: branchId }, { amount, method, userId: doctorId });
        }
        return inv;
      };

      // current (due in future)
      await mk(50, now + 5 * 86400000, undefined);
      // overdue 1-30
      await mk(80, now - 10 * 86400000, 30, 'cash');
      // overdue 31-60
      await mk(100, now - 40 * 86400000, undefined);
      // overdue 61+
      await mk(120, now - 100 * 86400000, undefined);

      const { aging } = await service.getInvoiceAging({ branch: branchId });

      expect(delta('current')).toEqual({ count: 1, amount: 50 });
      expect(delta('overdue1to30')).toEqual({ count: 1, amount: 50 }); // 80 - 30 paid
      expect(delta('overdue31to60')).toEqual({ count: 1, amount: 100 });
      expect(delta('overdue61Plus')).toEqual({ count: 1, amount: 120 });
      expect(delta('total').count).toBe(4);
    });
  });
});
