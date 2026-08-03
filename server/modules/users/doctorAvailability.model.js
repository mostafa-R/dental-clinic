import mongoose from 'mongoose';

/**
 * Doctor availability exceptions.
 * Used for time off, vacations, sick days, or custom working hours.
 */

export const AVAILABILITY_TYPE = {
  TIME_OFF: 'time_off',
  VACATION: 'vacation',
  SICK_LEAVE: 'sick_leave',
  CUSTOM_HOURS: 'custom_hours', // Override regular working hours for a specific day
  BLOCKED: 'blocked', // Blocked time slot (e.g., lunch break, meeting)
};

const availabilitySchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(AVAILABILITY_TYPE),
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Index for efficient overlap queries
availabilitySchema.index({ doctor: 1, start: 1, end: 1 });
availabilitySchema.index({ branch: 1, start: 1 });

// Validate end > start
availabilitySchema.pre('validate', function validateTimes() {
  if (this.start && this.end && this.end <= this.start) {
    this.invalidate('end', 'End time must be after start time');
  }
});

const DoctorAvailability = mongoose.model('DoctorAvailability', availabilitySchema);

export default DoctorAvailability;
