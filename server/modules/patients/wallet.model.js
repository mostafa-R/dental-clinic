import mongoose from 'mongoose';

import { WALLET_TX_TYPES } from '../../constants/wallet.js';
import { round2 } from '../../constants/accounting.js';

const walletTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: WALLET_TX_TYPES, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    installment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const walletSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, default: null },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    transactions: { type: [walletTransactionSchema], default: [] },
  },
  { timestamps: true },
);

walletSchema.methods.addTransaction = function ({ type, amount, reference, description, invoice, installment, userId }) {
  const balanceBefore = this.balance;
  const absAmount = round2(Math.abs(Number(amount)));
  const balanceAfter = type === 'credit'
    ? round2(balanceBefore + absAmount)
    : round2(balanceBefore - absAmount);

  if (balanceAfter < 0) {
    throw new Error('Insufficient wallet balance');
  }

  this.transactions.push({
    type,
    amount: absAmount,
    balanceBefore,
    balanceAfter,
    reference: reference || '',
    description: description || '',
    invoice: invoice || null,
    installment: installment || null,
    createdBy: userId || null,
  });

  this.balance = balanceAfter;
};

walletSchema.set('toJSON', { virtuals: true });
walletSchema.set('toObject', { virtuals: true });

walletSchema.index({ branch: 1, createdAt: -1 });

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
