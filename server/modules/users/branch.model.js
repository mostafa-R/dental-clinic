import mongoose from "mongoose";

/**
 * Working hours schema for clinic hours and doctor schedules.
 * Each day has open/close times. If closed, both are null.
 */
const workingHoursSchema = new mongoose.Schema(
  {
    open: {
      type: String, // Format: "HH:MM" (24-hour)
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Open time must be in HH:MM format or null if closed',
      },
    },
    close: {
      type: String, // Format: "HH:MM" (24-hour)
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Close time must be in HH:MM format or null if closed',
      },
    },
    closed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const branchSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Clinic working hours
    workingHours: {
      sunday: { type: workingHoursSchema, default: () => ({ closed: true }) },
      monday: { type: workingHoursSchema, default: () => ({ open: '09:00', close: '17:00', closed: false }) },
      tuesday: { type: workingHoursSchema, default: () => ({ open: '09:00', close: '17:00', closed: false }) },
      wednesday: { type: workingHoursSchema, default: () => ({ open: '09:00', close: '17:00', closed: false }) },
      thursday: { type: workingHoursSchema, default: () => ({ open: '09:00', close: '17:00', closed: false }) },
      friday: { type: workingHoursSchema, default: () => ({ open: '09:00', close: '17:00', closed: false }) },
      saturday: { type: workingHoursSchema, default: () => ({ closed: true }) },
    },
    // Break time (lunch, etc.)
    breakStart: {
      type: String, // Format: "HH:MM"
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Break start must be in HH:MM format',
      },
    },
    breakEnd: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Break end must be in HH:MM format',
      },
    },
    // Slot duration in minutes (default 30)
    slotDuration: {
      type: Number,
      min: 5,
      max: 120,
      default: 30,
    },
    // Buffer time between appointments in minutes
    bufferTime: {
      type: Number,
      min: 0,
      max: 60,
      default: 0,
    },
  },
  { timestamps: true },
);

/**
 * Check if a given time falls within clinic working hours.
 * @param {Date} start - Appointment start time
 * @param {Date} end - Appointment end time
 * @returns {object} { valid: boolean, reason?: string }
 */
branchSchema.methods.isWithinWorkingHours = function (start, end) {
  const dayName = DAYS_OF_WEEK[start.getDay()];
  const hours = this.workingHours?.[dayName];

  if (!hours || hours.closed) {
    return { valid: false, reason: `Clinic is closed on ${dayName}` };
  }

  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

  if (startTime < hours.open || endTime > hours.close) {
    return {
      valid: false,
      reason: `Appointment must be within working hours (${hours.open} - ${hours.close})`
    };
  }

  // Check break time
  if (this.breakStart && this.breakEnd) {
    if (startTime < this.breakEnd && endTime > this.breakStart) {
      return {
        valid: false,
        reason: `Appointment overlaps with break time (${this.breakStart} - ${this.breakEnd})`
      };
    }
  }

  return { valid: true };
};

branchSchema.index({ tenant: 1, name: 1 }, { unique: true });

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;

