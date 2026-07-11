import mongoose from 'mongoose';

import Counter from '../../core/counters.js';
import { COMMISSION_STATUS, round2 } from '../../constants/accounting.js';

export { COMMISSION_STATUS };

const commissionSchema = new mongoose.Schema(
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
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },
    commissionNo: {
      type: String,
      required: true,
      index: true,
    },
    treatmentItem: {
      type: String,
      trim: true,
      default: '',
    },
    procedureName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    baseAmount: {
      type: Number,
      required: true,
      min: 0,
      set: (v) => round2(v),
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    amount: {
      type: Number,
      required: true,
      set: (v) => round2(v),
    },
    status: {
      type: String,
      enum: COMMISSION_STATUS,
      default: 'pending',
      index: true,
    },
    paidDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

commissionSchema.pre('validate', async function assignCommissionNo(next) {
  if (!this.commissionNo) {
    const nextSeq = await Counter.next('commission', this.tenant);
    this.commissionNo = `COM-${String(nextSeq).padStart(5, '0')}`;
  }
  this.amount = round2((Number(this.baseAmount) || 0) * (Number(this.rate) || 0) / 100);
  next();
});

commissionSchema.set('toJSON', { virtuals: true });
commissionSchema.set('toObject', { virtuals: true });

commissionSchema.index({ tenant: 1, commissionNo: 1 }, { unique: true });
commissionSchema.index({ branch: 1, doctor: 1, status: 1 });
commissionSchema.index({ branch: 1, createdAt: -1 });

const Commission = mongoose.model('Commission', commissionSchema);

export default Commission;
