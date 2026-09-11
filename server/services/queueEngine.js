import Appointment from "../modules/appointments/appointment.model.js";
import { zonedTodayRangeUtc } from "../utils/zonedDates.js";
import { loadTenantTimezone } from "../utils/timezoneUtils.js";

/**
 * Live-queue engine (PRD §6.2).
 *
 * A queue is scoped by (tenant, branch, doctor, day-in-clinic-timezone).
 * Positions are DERIVED from ordering — appointments for one doctor cannot
 * share a `start` (unique partial index + app-level overlap guard), so two
 * concurrent bookings always land on distinct positions no matter how their
 * queries interleave. Keeping the ordering logic pure (no DB in
 * `computePositionFromMembers`) makes this provable in unit tests.
 *
 * "Ahead" counts only live appointments: scheduled / confirmed / checked_in /
 * in_progress. Once a patient ahead completes, cancels or no-shows they drop
 * out and the patients-ahead count shrinks.
 */

export const QUEUE_ACTIVE_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
];

// Position milestones that trigger a WhatsApp "your turn is getting closer"
// update. Near-turn (<= NEAR_TURN_MAX_AHEAD) takes over below 4.
export const QUEUE_POSITION_THRESHOLDS = [12, 10, 8, 6, 4];

export const NEAR_TURN_MAX_AHEAD = 3;
export const NEAR_TURN_MAX_WAIT_MINUTES = 90;
export const DEFAULT_SESSION_DURATION_MIN = 20;

/**
 * Pure ordering: rank `target` among preloaded queue members for the same
 * (branch, doctor, day). Members are compared by `start`, then `createdAt` as
 * a stable tiebreaker. Returns the patient-facing queue number and how many
 * patients are ahead. Race-free because starts are unique per doctor per day
 * (see module docstring).
 */
export function computePositionFromMembers(members, target) {
  const targetId = String(target?._id || target?.id || "");
  const targetStart = new Date(target.start).getTime();
  const targetCreated = target.createdAt ? new Date(target.createdAt).getTime() : 0;

  let ahead = 0;
  for (const m of members || []) {
    if (String(m._id || m.id) === targetId) continue;
    const mStart = new Date(m.start).getTime();
    const mCreated = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    const earlier =
      mStart < targetStart ||
      (mStart === targetStart && mCreated < targetCreated);
    if (earlier) ahead += 1;
  }
  return { queueNumber: ahead + 1, patientsAhead: ahead };
}

/**
 * Estimated minutes until the patient's turn: patients-ahead times the
 * doctor's average session duration.
 */
export function estimateWaitMinutes(patientsAhead, avgSessionMinutes) {
  const ahead = Number(patientsAhead) || 0;
  const avg = Number(avgSessionMinutes) || DEFAULT_SESSION_DURATION_MIN;
  return Math.round(ahead * avg);
}

/**
 * Average session duration in minutes from completed-visit history, falling
 * back to DEFAULT_SESSION_DURATION_MIN when there is no recent history.
 */
export function computeAvgSessionMinutes(completedRecords) {
  const durations = (completedRecords || [])
    .map((r) => {
      if (!r?.start || !r?.end) return null;
      const ms = new Date(r.end).getTime() - new Date(r.start).getTime();
      return Number.isFinite(ms) && ms > 0 ? ms / 60000 : null;
    })
    .filter((n) => n !== null);
  if (durations.length === 0) return DEFAULT_SESSION_DURATION_MIN;
  return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
}

export function isQueueMilestone(patientsAhead) {
  return QUEUE_POSITION_THRESHOLDS.includes(Number(patientsAhead));
}

/**
 * Pure decision for the periodic scanner: should we send a position update, a
 * near-turn alert, or nothing for a given appointment this tick?
 *
 * - Once near-turn was sent, nothing else is sent (position milestones under
 *   a near-turn announcement would just be noise).
 * - Near-turn wins over a milestone once the ahead count and the estimated
 *   wait both drop into range.
 * - A milestone fires only when arriving at a value lower than the last one
 *   we announced (strictly decreasing, so a cancelled appointment that makes
 *   the count jump e.g. 11 → 7 does not message 10 and 8 consecutively).
 */
export function positionDecision({
  nextAhead,
  lastNotifiedAhead,
  nearTurnAlreadyNotified,
  nearTurnDue,
}) {
  if (nearTurnAlreadyNotified) {
    return { sendPosition: false, sendNearTurn: false };
  }
  if (nearTurnDue) {
    return { sendPosition: false, sendNearTurn: true };
  }
  const ahead = Number(nextAhead) || 0;
  const last = lastNotifiedAhead === null || lastNotifiedAhead === undefined
    ? Infinity
    : Number(lastNotifiedAhead);
  return { sendPosition: ahead < last && isQueueMilestone(ahead), sendNearTurn: false };
}

export function isSameClinicDay(start, tz, now = new Date()) {
  const range = zonedTodayRangeUtc(now.getTime(), tz);
  if (!range) return false;
  const t = new Date(start).getTime();
  return t >= range.start && t < range.end;
}

/**
 * Load today's live queue members for one (tenant, branch, doctor) in the
 * clinic's timezone, ordered. Returns lean docs (start, createdAt).
 */
export async function loadTodayQueueMembers({ tenant, branch, doctor, tz }) {
  const range = zonedTodayRangeUtc(Date.now(), tz);
  if (!range) return [];
  return Appointment.find({
    tenant,
    branch,
    doctor,
    start: { $gte: range.start, $lt: range.end },
    status: { $in: QUEUE_ACTIVE_STATUSES },
  })
    .select("start createdAt")
    .sort({ start: 1, createdAt: 1 })
    .lean();
}

/**
 * Compute the current { queueNumber, patientsAhead } for an appointment doc
 * against today's live queue (its own tenant/branch/doctor).
 */
export async function computePosition(appointment, { tz } = {}) {
  if (!appointment?.tenant || !appointment?.branch || !appointment?.doctor) {
    return { queueNumber: 1, patientsAhead: 0 };
  }
  const resolvedTz = tz || (await loadTenantTimezone(appointment.tenant));
  const members = await loadTodayQueueMembers({
    tenant: appointment.tenant,
    branch: appointment.branch,
    doctor: appointment.doctor,
    tz: resolvedTz,
  });
  return computePositionFromMembers(members, appointment);
}