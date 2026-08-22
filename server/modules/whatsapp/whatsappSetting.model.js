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
    // Primary short-window reminder (PRD §6.4 default schedule: 2h before).
    reminderHours: { type: Number, default: 2, min: 1, max: 72 },
    // Secondary long-window reminder (PRD §6.4 default schedule: 24h before).
    // Set to 0 to disable the second reminder entirely.
    reminderHoursSecondary: { type: Number, default: 24, min: 0, max: 168 },
    // Notify patients on WhatsApp about overdue installments (§6.3 cron).
    installmentReminder: { type: Boolean, default: false },
    // Send a reschedule suggestion when a patient is marked no-show (BR-PT-04).
    noShowReminder: { type: Boolean, default: false },
  },
  status: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'error'],
    default: 'disconnected',
  },
  lastError: { type: String, default: '' },
  qrCode: { type: String, default: '', select: false },
}, { timestamps: true });

whatsappSettingSchema.pre('validate', function validateConfig() {
  if (this.enabled) {
    if (!this.config?.phoneNumber) {
      this.invalidate('config.phoneNumber', 'Phone number is required when WhatsApp is enabled');
    }
    if (this.provider === 'cloud_api') {
      if (!this.config?.accessToken) {
        this.invalidate('config.accessToken', 'Access token is required for Cloud API provider');
      }
      if (!this.config?.phoneNumberId) {
        this.invalidate('config.phoneNumberId', 'Phone number ID is required for Cloud API provider');
      }
    }
  }
});

export default mongoose.model('WhatsAppSetting', whatsappSettingSchema);
