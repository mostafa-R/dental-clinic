import mongoose from 'mongoose';

import TreatmentPlan from './treatmentPlan.model.js';
import DentalChart from './dentalChart.model.js';
import Invoice from '../billing/invoice.model.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { deductForProcedure } from '../inventory/inventory.service.js';
import { emitItemAlerts } from '../../services/inventoryCron.js';
import { withTransaction } from '../../core/transaction.js';

export const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName' },
  { path: 'createdBy', select: 'name' },
  { path: 'updatedBy', select: 'name' },
];

export function normalizeItem(raw) {
  const item = { ...raw };
  if (item.tooth === undefined || item.tooth === null || item.tooth === '') {
    item.tooth = null;
  } else {
    const n = Number(item.tooth);
    item.tooth = Number.isInteger(n) && n >= 1 && n <= 32 ? n : null;
  }
  if (item.appointment) item.appointment = toObjectId(item.appointment);
  if (item.completedDate) item.completedDate = new Date(item.completedDate);
  // item.invoice is intentionally ignored here: the invoice link is stamped
  // server-side by generateInvoiceFromPlan so a client can never pre-link an
  // item to an invoice or overwrite an existing link.
  delete item.invoice;
  return item;
}

export async function loadPlan(patientId, planId, branchFilter) {
  if (!mongoose.isValidObjectId(planId)) throw ApiError.badRequest('Invalid treatment plan id');
  return TreatmentPlan.findOne({ _id: planId, patient: patientId, ...branchFilter }).populate(POPULATE);
}

export async function generateInvoiceFromPlan(plan, patient, { itemIds, discount, tax, notes, userId }) {
  // Filter to the requested items, or default to all pending, un-invoiced items.
  // This is the *user intent* — the authoritative check happens again inside the
  // transaction where the plan is re-read with the session (H2).
  const rawSelected = itemIds?.length
    ? plan.items.filter((item) => itemIds.includes(item._id.toString()))
    : plan.items.filter((item) => item.status === 'pending' && !item.invoice);

  if (rawSelected.length === 0) {
    throw ApiError.badRequest('No valid items selected');
  }

  // Fetch dental chart once (avoid N+1 per-item queries).
  const dentalChart = await DentalChart.findOne({ patient: patient._id, branch: patient.branch }).lean();

  const result = await withTransaction(async (session) => {
    // Re-read the plan INSIDE the transaction. Snapshot isolation means two
    // concurrent invoicing requests contend here: whichever commits first wins,
    // and the loser sees item.invoice already set and throws 409 — closing the
    // double-invoice race (H2).
    const freshPlan = await TreatmentPlan.findById(plan._id).session(session);
    if (!freshPlan) {
      throw ApiError.notFound('Treatment plan not found');
    }

    const selectedIds = new Set(rawSelected.map((item) => item._id.toString()));
    const selectedItems = freshPlan.items.filter((item) => selectedIds.has(item._id.toString()));

    if (selectedItems.length === 0) {
      throw ApiError.badRequest('No valid items selected');
    }

    // An item can only be billed once. Re-invoicing an item would overwrite its
    // invoice link and orphan the previous invoice — leaving that invoice without
    // its linked items (ISSUE-021). This guard now runs against the transactional
    // snapshot, so a stale in-memory plan can never bypass it.
    const alreadyInvoiced = selectedItems.find((item) => item.invoice);
    if (alreadyInvoiced) {
      throw ApiError.conflict(
        `"${alreadyInvoiced.procedureName}" has already been invoiced`,
      );
    }

    const invoiceItems = selectedItems.map((item) => ({
      description: item.tooth
        ? `${item.procedureName} (#${item.tooth})`
        : item.procedureName,
      quantity: 1,
      unitPrice: item.estimatedCost || 0,
    }));

    const invoice = await Invoice.create([{
      tenant: patient.tenant,
      branch: patient.branch,
      patient: patient._id,
      items: invoiceItems,
      discount: discount || 0,
      tax: tax || 0,
      notes: notes || '',
      createdBy: userId,
    }], { session }).then((docs) => docs[0]);

    const deductionLog = [];
    const alertItems = [];
    const awardFees = [];
    for (const item of selectedItems) {
      item.invoice = invoice._id;
      if (item.status === 'pending') {
        item.status = 'in_progress';
        item.completedDate = null;
      }
      // Auto-deduction keyed on the PROCEDURE NAME (issue #3), independent of
      // whether the item is linked to a tooth. It never blocks invoicing on
      // insufficient stock (issue #2): a shortfall is recorded on the log so
      // the operator can see it surfaced in the response. Items without a
      // meaningful procedure name are skipped (nothing to map).
      const tooth = item.tooth !== null && dentalChart?.teeth
        ? dentalChart.teeth.find((t) => t.number === item.tooth)
        : null;
      const toothState = tooth?.state || '';
      if (!item.procedureName || !String(item.procedureName).trim()) {
        continue;
      }
      const deduction = await deductForProcedure({
        branchId: patient.branch,
        tenantId: patient.tenant,
        toothState,
        procedureName: item.procedureName,
        userId,
        session,
        invoiceId: invoice._id,
      });
      if (deduction.deductions.length) {
        deductionLog.push({ item: item.procedureName, ...deduction });
        alertItems.push(...deduction.updatedItems);
      } else if (deduction.shortfall > 0) {
        // Bill anyway; surface the shortfall clearly.
        deductionLog.push({
          item: item.procedureName,
          deductions: [],
          shortfall: deduction.shortfall,
        });
      }
    }

    freshPlan.updatedBy = userId;
    await freshPlan.save({ session });

    return { invoice, plan: freshPlan, deductions: deductionLog, alertItems };
  });

  await result.invoice.populate([
    { path: 'patient', select: 'patientId firstName lastName phone' },
    { path: 'payments.recordedBy', select: 'name' },
    { path: 'createdBy', select: 'name' },
  ]);

  // Emit low-stock / expiring alerts AFTER the transaction commits, using the
  // post-decrement documents, so no phantom alerts fire on rolled-back state
  // (issue #1/#5).
  for (const item of result.alertItems || []) {
    try {
      emitItemAlerts(item);
    } catch (err) {
      // Emission is best-effort; never break the invoice response.
      console.warn(`[TreatmentPlan] Alert emission failed: ${err.message}`);
    }
  }

  return { invoice: result.invoice, plan: result.plan, deductions: result.deductions };
}
