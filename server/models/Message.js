import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

messageSchema.index({ branch: 1, channel: 1, createdAt: -1 });
messageSchema.index({ branch: 1, sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;