import mongoose from 'mongoose';

import { ATTACHMENT_TYPES } from '../../constants/dental.js';

const medicalAttachmentSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ATTACHMENT_TYPES,
      default: 'xray',
    },
    filename: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: () => new Date(),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

medicalAttachmentSchema.index({ branch: 1, patient: 1 });
medicalAttachmentSchema.index({ branch: 1, uploadedAt: -1 });

const MedicalAttachment = mongoose.model('MedicalAttachment', medicalAttachmentSchema);

export default MedicalAttachment;
