// Canonical booking-window defaults (LLM product decision, shared by the
// booking/rescheduling validation path and the no-show WhatsApp copy so both
// always agree on how far ahead appointments can be booked).

// Patients cannot book closer than 60 minutes to the slot start...
export const DEFAULT_APPT_MIN_ADVANCE = 60; // hours? minutes? -> minutes
// ...nor further than 90 days out (PRD §9.3 "Advance Booking Window").
export const DEFAULT_APPT_MAX_ADVANCE = 90; // days

// Skill-based duration default when a branch has not configured its own
// slot duration (same constant the appointment controller falls back to).
export const DEFAULT_SLOT_DURATION_MINUTES = 30;