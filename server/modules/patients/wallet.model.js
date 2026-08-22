import mongoose from 'mongoose';

import { WALLET_TX_TYPES } from '../../constants/wallet.js';

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
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    transactions: { type: [walletTransactionSchema], default: [] },
  },
  { timestamps: true },
);

walletSchema.set('toJSON', { virtuals: true });
walletSchema.set('toObject', { virtuals: true });

walletSchema.index({ branch: 1, createdAt: -1 });
// One wallet per patient per branch (PRD §6.3).
walletSchema.index({ patient: 1, branch: 1 }, { unique: true });

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
