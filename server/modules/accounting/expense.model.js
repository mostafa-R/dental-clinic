import mongoose from 'mongoose';

import Counter from '../../core/counters.js';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, round2 } from '../../constants/accounting.js';

export { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS };

const expenseSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    expenseNo: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      set: (v) => round2(v),
    },
    date: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: EXPENSE_PAYMENT_METHODS,
      default: 'cash',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

expenseSchema.pre('validate', async function assignExpenseNo() {
  if (!this.expenseNo) {
    const nextSeq = await Counter.next('expense', this.tenant, this.$session?.());
    this.expenseNo = `EXP-${String(nextSeq).padStart(5, '0')}`;
  }
});

expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

expenseSchema.index({ tenant: 1, expenseNo: 1 }, { unique: true });
expenseSchema.index({ branch: 1, date: -1 });
expenseSchema.index({ branch: 1, category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);

export default Expense;
