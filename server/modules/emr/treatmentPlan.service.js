import mongoose from 'mongoose';

import TreatmentPlan from './treatmentPlan.model.js';
import DentalChart from './dentalChart.model.js';
import Invoice from '../billing/invoice.model.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { deductForProcedure } from '../inventory/inventory.service.js';
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
  if (item.invoice) item.invoice = toObjectId(item.invoice);
  if (item.completedDate) item.completedDate = new Date(item.completedDate);
  return item;
}

export async function loadPlan(patientId, planId, branchFilter) {
  if (!mongoose.isValidObjectId(planId)) throw ApiError.badRequest('Invalid treatment plan id');
  return TreatmentPlan.findOne({ _id: planId, patient: patientId, ...branchFilter }).populate(POPULATE);
}

export async function generateInvoiceFromPlan(plan, patient, { itemIds, discount, tax, notes, userId }) {
  const selectedItems = plan.items.filter((item) => itemIds.includes(item._id.toString()));
  if (selectedItems.length === 0) {
    throw ApiError.badRequest('No valid items selected');
  }

  const invoiceItems = selectedItems.map((item) => ({
    description: item.tooth
      ? `${item.procedureName} (#${item.tooth})`
      : item.procedureName,
    quantity: 1,
    unitPrice: item.estimatedCost || 0,
  }));

  // Fetch dental chart once (avoid N+1 per-item queries).
  const dentalChart = await DentalChart.findOne({ patient: patient._id }).lean();

  const result = await withTransaction(async (session) => {
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
    for (const item of selectedItems) {
      item.invoice = invoice._id;
      if (item.status === 'pending') {
        item.status = 'completed';
        item.completedDate = new Date();
      }
      if (item.tooth) {
        const tooth = dentalChart?.teeth?.find((t) => t.number === item.tooth);
        const toothState = tooth?.state || '';
        const deductions = await deductForProcedure(
          patient.branch,
          patient.tenant,
          toothState,
          item.procedureName,
          userId,
          session,
        );
        if (deductions.length) deductionLog.push({ item: item.procedureName, deductions });
      }
    }

    plan.updatedBy = userId;
    await plan.save({ session });

    return { invoice, deductions: deductionLog };
  });

  await result.invoice.populate([
    { path: 'patient', select: 'patientId firstName lastName phone' },
    { path: 'payments.recordedBy', select: 'name' },
    { path: 'createdBy', select: 'name' },
  ]);

  return { invoice: result.invoice, plan, deductions: result.deductions };
}
