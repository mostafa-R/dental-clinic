import * as invoiceService from './invoice.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../../utils/branchScope.js';
import { emitToBranch } from '../../socket/index.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { sendCsv } from '../../utils/csv.js';
import { round2 } from '../../constants/accounting.js';

function emitInvoice(branchId, event, invoice) {
  const payload = { invoice: invoice.toJSON ? invoice.toJSON() : invoice };
  emitToBranch(branchId, event, payload);
}

/**
 * Serialize an invoice for the response. During an impersonation session the
 * populated patient (firstName/lastName/phone) carries PHI and must be
 * stripped before it leaves the API.
 */
function serializeInvoice(invoice, req) {
  if (!req.isImpersonation) return invoice;
  return invoice && typeof invoice.toJSON === 'function' ? stripPHI(invoice.toJSON()) : stripPHI(invoice);
}

export const listInvoices = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await invoiceService.listInvoices(branchFilter, req.validatedQuery);
  if (req.isImpersonation) result.invoices = result.invoices.map((i) => serializeInvoice(i, req));
  return sendSuccess(res, result);
});

export const getBillingSummary = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await invoiceService.getBillingSummary(branchFilter);
  return sendSuccess(res, result);
});

/**
 * Audit M6 (Report Builder v1): CSV export for the invoice list. The query
 * filters are validated by the SAME schema as `GET /billing`, and the service
 * reuses `listInvoices`' filter builder, so an export can never return more
 * (or more sensitive) data than the caller could page through in the UI.
 * Columns are deliberately flat/financial — no line items, payments or
 * changelog arrays — and the patient columns match what `billing:read` users
 * already see.
 */
export const exportInvoicesCsv = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const invoices = await invoiceService.listInvoicesForExport(branchFilter, req.validatedQuery);

  const headers = [
    { label: 'Invoice No', getValue: (r) => r.invoiceNo },
    { label: 'Patient ID', getValue: (r) => r.patient?.patientId || '' },
    { label: 'Patient Name', getValue: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') },
    { label: 'Phone', getValue: (r) => r.patient?.phone || '' },
    { label: 'Status', getValue: (r) => r.status },
    { label: 'Total', getValue: (r) => r.total },
    { label: 'Paid', getValue: (r) => r.paidAmount },
    { label: 'Outstanding', getValue: (r) => round2((r.total || 0) - (r.paidAmount || 0)) },
    { label: 'Due Date', getValue: (r) => (r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '') },
    { label: 'Created', getValue: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '') },
  ];
  return sendCsv(res, {
    filename: `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    rows: invoices,
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.params.id, filterByBranch(req));
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) });
});

export const createInvoice = asyncHandler(async (req, res) => {
  const data = req.validatedBody;

  if (!data.branch && data.appointment) {
    const { default: Appointment } = await import('../appointments/appointment.model.js');
    const appt = await Appointment.findById(data.appointment).select('branch').lean();
    if (appt?.branch) data.branch = String(appt.branch);
  }

  const branch = await resolveBranchForCreate(req, data.branch);
  const tenant = currentTenant(req);

  const invoice = await invoiceService.createInvoice({
    data, branch, tenant, userId: req.user._id,
  });

  emitInvoice(branch, 'invoice:created', invoice);
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) }, 201);
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.updateInvoice(
    req.params.id, filterByBranch(req), req.validatedBody, req.user._id,
  );
  emitInvoice(invoice.branch, 'invoice:updated', invoice);
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) });
});

export const addPayment = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.addPayment(req.params.id, filterByBranch(req), {
    ...req.validatedBody,
    idempotencyKey: req.headers['x-idempotency-key'] || null,
    userId: req.user._id,
  });
  emitInvoice(invoice.branch, 'invoice:updated', invoice);
  // PRD §6.6 trigger 5: a dedicated realtime event for recorded payments so
  // reception/accounting screens can react without refetching the invoice.
  const lastPayment = invoice.payments?.[invoice.payments.length - 1];
  emitToBranch(invoice.branch, 'payment.recorded', {
    invoiceId: String(invoice._id),
    invoiceNo: invoice.invoiceNo,
    payment: lastPayment
      ? {
          amount: lastPayment.amount,
          method: lastPayment.method,
          date: lastPayment.date,
          reference: lastPayment.reference,
        }
      : null,
    paidAmount: invoice.paidAmount,
    status: invoice.status,
  });
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) });
});

export const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.voidInvoice(req.params.id, filterByBranch(req), {
    reason: req.validatedBody.reason,
    userId: req.user._id,
  });
  emitInvoice(invoice.branch, 'invoice:updated', invoice);
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) });
});

export const refundPayment = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.refundPayment(req.params.id, filterByBranch(req), {
    ...req.validatedBody,
    idempotencyKey: req.headers['x-idempotency-key'] || null,
    userId: req.user._id,
  });
  emitInvoice(invoice.branch, 'invoice:updated', invoice);
  return sendSuccess(res, { invoice: serializeInvoice(invoice, req) });
});

export const getInvoiceAging = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await invoiceService.getInvoiceAging(branchFilter);
  if (req.isImpersonation) {
    result.invoices = result.invoices.map((i) => stripPHI(i));
  }
  return sendSuccess(res, result);
});
