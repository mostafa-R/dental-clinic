import mongoose from "mongoose";

import { round2 } from "../../constants/accounting.js";
import Counter from '../../core/counters.js';

export const INVOICE_STATUS = ["unpaid", "partial", "paid", "void"];

export const PAYMENT_METHODS = ["cash", "card", "transfer", "wallet"];

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      validate: {
        validator(value) {
          if (this.isRefund) return value < 0 && Math.abs(value) >= 0.01;
          return value >= 0.01;
        },
        message: 'Amount must be greater than 0',
      },
    },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, default: "" },
    idempotencyKey: { type: String, trim: true, default: null, index: true },
    date: { type: Date, default: () => new Date() },
    notes: { type: String, trim: true, maxlength: 300, default: "" },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isRefund: { type: Boolean, default: false },
  },
  { _id: false },
);

const changeLogSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    changedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
      default: null,
    },
    invoiceNo: {
      type: String,
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },
    items: {
      type: [invoiceItemSchema],
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        "At least one line item is required",
      ],
    },
    subtotal: { type: Number, default: 0 },
    discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
    discountRate: { type: Number, default: 0, min: 0, max: 100 },
    discount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, default: null },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: INVOICE_STATUS,
      default: "unpaid",
      index: true,
    },
    payments: { type: [paymentSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    changelog: { type: [changeLogSchema], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

/**
 * Recompute derived money fields (subtotal/total/paidAmount) and derive the
 * status from the collected amount, unless the invoice was manually voided.
 */
function computeTotals(doc) {
  // Compute per-item totals (qty * unitPrice - itemDiscount + itemTax)
  for (const item of doc.items || []) {
    const lineBase = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    const itemDiscount = Math.min(Number(item.discount) || 0, lineBase);
    const itemTax = Math.max(Number(item.tax) || 0, 0);
    item.total = round2(lineBase - itemDiscount + itemTax);
  }

  const subtotal = round2(
    (doc.items || []).reduce((sum, it) => sum + (Number(it.total) || 0), 0),
  );

  let discount = 0;
  if (doc.discountType === "percentage") {
    const rate = Math.min(Math.max(Number(doc.discountRate) || 0, 0), 100);
    discount = round2(subtotal * rate / 100);
    doc.discount = discount;
  } else {
    discount = round2(Math.min(Number(doc.discount) || 0, subtotal));
    doc.discount = discount;
  }

  // Apply taxRate when tax is not explicitly provided
  let tax = round2(Math.max(Number(doc.tax) || 0, 0));
  if (tax === 0 && doc.taxRate) {
    const taxRate = Math.min(Math.max(Number(doc.taxRate) || 0, 0), 100);
    tax = round2((subtotal - discount) * taxRate / 100);
  }
  const total = round2(Math.max(subtotal - discount + tax, 0));
  const paidAmount = round2(
    (doc.payments || []).reduce((sum, p) => {
      const amt = Number(p.amount) || 0;
      return sum + (p.isRefund ? -Math.abs(amt) : amt);
    }, 0),
  );

  doc.subtotal = subtotal;
  doc.total = total;
  doc.paidAmount = paidAmount;

  // Distribute paid amount across items proportionally
  if (total > 0 && paidAmount > 0) {
    let remaining = paidAmount;
    const items = doc.items || [];
    for (let i = 0; i < items.length; i++) {
      const itemTotal = items[i].total || 0;
      if (i === items.length - 1) {
        items[i].paidAmount = round2(Math.min(remaining, itemTotal));
      } else {
        const alloc = round2(Math.min(itemTotal, round2(paidAmount * itemTotal / total)));
        items[i].paidAmount = alloc;
        remaining = round2(remaining - alloc);
      }
    }
  }

  if (doc.status !== "void") {
    if (total > 0 && paidAmount >= total) doc.status = "paid";
    else if (paidAmount > 0) doc.status = "partial";
    else doc.status = "unpaid";
  }
}

invoiceSchema.pre("validate", async function assignInvoiceNo() {
  // Skip auto-generation if invoiceNo is already set (e.g., from transactional create)
  // This prevents double-increment of the counter
  if (!this.invoiceNo) {
    const nextSeq = await Counter.next('invoice', this.tenant, this.$session?.());
    this.invoiceNo = `INV-${String(nextSeq).padStart(5, "0")}`;
  }
  const financialFields = ['items', 'discount', 'discountType', 'discountRate', 'tax', 'taxRate', 'payments'];
  const needsRecompute = this.isNew || financialFields.some((f) => this.isModified(f));
  if (needsRecompute) {
    computeTotals(this);
  }
});

invoiceSchema.virtual("balance").get(function balance() {
  return round2((this.total || 0) - (this.paidAmount || 0));
});

invoiceSchema.virtual("itemCount").get(function itemCount() {
  return (this.items || []).length;
});

invoiceSchema.virtual("isOverdue").get(function isOverdue() {
  if (!this.dueDate) return false;
  if (this.status === "paid" || this.status === "void") return false;
  return new Date(this.dueDate) < new Date();
});

invoiceSchema.virtual("daysOverdue").get(function daysOverdue() {
  if (!this.dueDate || this.status === "paid" || this.status === "void") return 0;
  const diff = Date.now() - new Date(this.dueDate).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
});

invoiceSchema.set("toJSON", { virtuals: true });
invoiceSchema.set("toObject", { virtuals: true });

invoiceSchema.index({ tenant: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ branch: 1, status: 1 });
invoiceSchema.index({ branch: 1, createdAt: -1 });
invoiceSchema.index({ patient: 1, createdAt: -1 });
invoiceSchema.index({ dueDate: 1, status: 1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
