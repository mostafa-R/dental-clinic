import mongoose from 'mongoose';

import { INSTALLMENT_STATUS, INSTALLMENT_PLAN_STATUS, INSTALLMENT_FREQUENCIES } from '../../constants/wallet.js';
import { round2 } from '../../constants/accounting.js';

const installmentSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    // PRD §6.3: overdue installments may carry an optional late fee that is
    // added to the amount due when the installment is settled.
    lateFee: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date, default: null },
    status: { type: String, enum: INSTALLMENT_STATUS, default: 'pending' },
    paymentMethod: { type: String, default: null },
    paymentRef: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: true },
);

const installmentPlanSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, default: null },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    totalAmount: { type: Number, required: true, min: 0.01 },
    paidAmount: { type: Number, default: 0, min: 0 },
    installments: { type: [installmentSchema], default: [] },
    frequency: { type: String, enum: INSTALLMENT_FREQUENCIES, default: 'monthly' },
    status: { type: String, enum: INSTALLMENT_PLAN_STATUS, default: 'active' },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

installmentPlanSchema.virtual('installmentCount').get(function () {
  return this.installments.length;
});

installmentPlanSchema.virtual('paidInstallments').get(function () {
  return this.installments.filter((i) => i.status === 'paid').length;
});

installmentPlanSchema.virtual('balance').get(function () {
  return round2(this.totalAmount - this.paidAmount);
});

installmentPlanSchema.virtual('progress').get(function () {
  if (this.installments.length === 0) return 0;
  return Math.round((this.paidInstallments / this.installments.length) * 100);
});

installmentPlanSchema.pre('save', function recomputePaidAmount() {
  this.paidAmount = round2(
    this.installments.reduce((s, inst) => s + (inst.paidAmount || 0), 0),
  );
});

installmentPlanSchema.set('toJSON', { virtuals: true });
installmentPlanSchema.set('toObject', { virtuals: true });

installmentPlanSchema.index({ branch: 1, status: 1 });
installmentPlanSchema.index({ patient: 1, status: 1 });
installmentPlanSchema.index({ 'installments.dueDate': 1, 'installments.status': 1 });
installmentPlanSchema.index({ invoice: 1, status: 1 }, { partialFilterExpression: { invoice: { $ne: null }, status: { $in: ['active', 'overdue'] } } });

const InstallmentPlan = mongoose.model('InstallmentPlan', installmentPlanSchema);

export default InstallmentPlan;
