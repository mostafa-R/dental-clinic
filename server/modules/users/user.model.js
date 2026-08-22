import bcrypt from "bcryptjs";
import mongoose from "mongoose";

/**
 * Doctor working hours schema.
 * Can be different from clinic hours (e.g., doctor works part-time).
 */
const doctorWorkingHoursSchema = new mongoose.Schema(
  {
    open: {
      type: String, // Format: "HH:MM" (24-hour)
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Open time must be in HH:MM format or null if not working',
      },
    },
    close: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v === null || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
        message: 'Close time must be in HH:MM format or null if not working',
      },
    },
    notWorking: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const userSchema = new mongoose.Schema(
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
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // PRD §6.1: users can log in with a username instead of their email.
    username: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 60,
      default: null,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    commissionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    isDoctor: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Doctor-specific working hours (only applies if isDoctor is true)
    // If not set, falls back to clinic hours
    workingHours: {
      sunday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      monday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      tuesday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      wednesday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      thursday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      friday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
      saturday: { type: doctorWorkingHoursSchema, default: () => ({ notWorking: true }) },
    },
    // Appointment settings for doctors
    appointmentSettings: {
      slotDuration: {
        type: Number,
        min: 5,
        max: 120,
        default: 30, // Override clinic default if set
      },
      bufferTime: {
        type: Number,
        min: 0,
        max: 60,
        default: 0,
      },
      maxAdvanceDays: {
        type: Number,
        min: 1,
        max: 365,
        default: 90, // Max days in advance for booking
      },
      minAdvanceMinutes: {
        type: Number,
        min: 0,
        max: 1440,
        default: 60, // Min minutes before appointment for booking
      },
    },
    preferences: {
      language: {
        type: String,
        enum: ["en", "ar"],
        default: null,
      },
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: null,
      },
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.tokenVersion;
  delete obj.__v;
  return obj;
};

/**
 * Check if doctor is available at the given time.
 * @param {Date} start - Appointment start time
 * @param {Date} end - Appointment end time
 * @returns {object} { available: boolean, reason?: string }
 */
userSchema.methods.isAvailableAt = function (start, end) {
  if (!this.isDoctor) {
    return { available: false, reason: 'User is not a doctor' };
  }

  const dayName = DAYS_OF_WEEK[start.getDay()];
  const hours = this.workingHours?.[dayName];

  // Check if doctor has custom hours set
  if (hours && !hours.notWorking && hours.open && hours.close) {
    const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    if (startTime < hours.open || endTime > hours.close) {
      return {
        available: false,
        reason: `Doctor is only available ${hours.open} - ${hours.close} on ${dayName}`
      };
    }
  } else if (hours?.notWorking) {
    return { available: false, reason: `Doctor does not work on ${dayName}` };
  }

  // Check advance booking limits
  const settings = this.appointmentSettings || {};
  const now = new Date();

  if (settings.minAdvanceMinutes) {
    const minTime = new Date(now.getTime() + settings.minAdvanceMinutes * 60000);
    if (start < minTime) {
      return {
        available: false,
        reason: `Appointments must be booked at least ${settings.minAdvanceMinutes} minutes in advance`
      };
    }
  }

  if (settings.maxAdvanceDays) {
    const maxTime = new Date(now.getTime() + settings.maxAdvanceDays * 86400000);
    if (start > maxTime) {
      return {
        available: false,
        reason: `Appointments can only be booked up to ${settings.maxAdvanceDays} days in advance`
      };
    }
  }

  return { available: true };
};

userSchema.index({ tenant: 1, email: 1 }, { unique: true });

// Usernames are optional but, when set, unique per clinic (PRD §6.1).
userSchema.index(
  { tenant: 1, username: 1 },
  {
    unique: true,
    name: "unique_username_per_tenant",
    partialFilterExpression: { username: { $type: "string" } },
  },
);

const User = mongoose.model("User", userSchema);

export default User;

