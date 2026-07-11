import mongoose from 'mongoose';

const whatsappSettingSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
  },
  enabled: { type: Boolean, default: false },
  provider: {
    type: String,
    enum: ['whatsapp_web', 'cloud_api', 'twilio'],
    default: 'whatsapp_web',
  },
  config: {
    phoneNumber: { type: String, default: '' },
    session: { type: String, default: '', select: false },
    accessToken: { type: String, default: '', select: false },
    phoneNumberId: { type: String, default: '' },
  },
  settings: {
    appointmentReminder: { type: Boolean, default: false },
    appointmentConfirm: { type: Boolean, default: false },
    reminderHours: { type: Number, default: 2, min: 1, max: 72 },
  },
  status: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'error'],
    default: 'disconnected',
  },
  lastError: { type: String, default: '' },
  qrCode: { type: String, default: '', select: false },
}, { timestamps: true });

export default mongoose.model('WhatsAppSetting', whatsappSettingSchema);
