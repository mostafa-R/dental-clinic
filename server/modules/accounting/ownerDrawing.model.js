import mongoose from 'mongoose';

import Counter from '../../core/counters.js';
import { EXPENSE_PAYMENT_METHODS, round2 } from '../../constants/accounting.js';

const ownerDrawingSchema = new mongoose.Schema(
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
    drawingNo: {
      type: String,
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      set: (v) => round2(v),
    },
    paymentMethod: {
      type: String,
      enum: EXPENSE_PAYMENT_METHODS,
      default: 'cash',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    date: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
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

ownerDrawingSchema.pre('validate', async function assignDrawingNo() {
  if (!this.drawingNo) {
    const nextSeq = await Counter.next('owner_drawing', this.tenant, this.$session?.());
    this.drawingNo = `DRW-${String(nextSeq).padStart(5, '0')}`;
  }
});

ownerDrawingSchema.set('toJSON', { virtuals: true });
ownerDrawingSchema.set('toObject', { virtuals: true });

ownerDrawingSchema.index({ tenant: 1, drawingNo: 1 }, { unique: true });
ownerDrawingSchema.index({ branch: 1, date: -1 });

const OwnerDrawing = mongoose.model('OwnerDrawing', ownerDrawingSchema);

export default OwnerDrawing;
