import mongoose from 'mongoose';

const channelReadSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    channel: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

channelReadSchema.index({ tenant: 1, branch: 1, channel: 1, user: 1 }, { unique: true });

const ChannelRead = mongoose.model('ChannelRead', channelReadSchema);

export default ChannelRead;
