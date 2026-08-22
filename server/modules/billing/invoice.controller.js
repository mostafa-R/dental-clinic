import * as invoiceService from './invoice.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../../utils/branchScope.js';
import { emitToBranch } from '../../socket/index.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

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
