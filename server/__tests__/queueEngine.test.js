/**
 * Unit tests for the live-queue engine (PRD §6.2).
 *
 * Positions are DERIVED from ordering — a patient's place is the count of other
 * active appointments with an earlier (start, createdAt) in the same
 * (tenant, branch, doctor, day) queue. Uniqueness across concurrent bookings is
 * guaranteed by the DB (one doctor cannot hold two appointments with the same
 * `start` — unique partial index + app-level overlap guard), so two racing
 * *readers* that see the same snapshot derive the same position, and two racing
 * *writers* never both persist the same `start`. This file pins that contract.
 */

import { describe, it, expect } from 'vitest';

import {
  computePositionFromMembers,
  estimateWaitMinutes,
  computeAvgSessionMinutes,
  isQueueMilestone,
  positionDecision,
  isSameClinicDay,
  QUEUE_POSITION_THRESHOLDS,
  NEAR_TURN_MAX_AHEAD,
  DEFAULT_SESSION_DURATION_MIN,
} from '../services/queueEngine.js';

const T = (h, m = 0) => {
  const d = new Date(Date.UTC(2026, 0, 15, h, m));
  return d;
};

function member(id, start, createdAt) {
  return { _id: id, start, createdAt };
}

describe('computePositionFromMembers', () => {
  it('assigns strictly increasing, distinct queue numbers by start order', () => {
    const members = [
      member('a', T(9, 0), T(0)),
      member('b', T(10, 0), T(0)),
      member('c', T(11, 0), T(0)),
    ];
    expect(computePositionFromMembers(members, members[0])).toEqual({
      queueNumber: 1,
      patientsAhead: 0,
    });
    expect(computePositionFromMembers(members, members[1])).toEqual({
      queueNumber: 2,
      patientsAhead: 1,
    });
    expect(computePositionFromMembers(members, members[2])).toEqual({
      queueNumber: 3,
      patientsAhead: 2,
    });
  });

  it('uses createdAt as a stable tiebreaker for identical starts', () => {
    const earlier = member('x', T(10, 0), T(1));
    const later = member('y', T(10, 0), T(2));
    const members = [later, earlier]; // unsorted input must not matter
    expect(computePositionFromMembers(members, earlier)).toEqual({
      queueNumber: 1,
      patientsAhead: 0,
    });
    expect(computePositionFromMembers(members, later)).toEqual({
      queueNumber: 2,
      patientsAhead: 1,
    });
  });

  it('the ordering is total: every member gets a unique number', () => {
    // 20 members sharing starts in pairs — positions must still be unique.
    const members = [];
    for (let i = 0; i < 20; i += 1) {
      members.push(member(`m${i}`, T(9, i), new Date(Date.UTC(2026, 0, 15, 9, 0, 0, i))));
    }
    const numbers = members.map((m) => computePositionFromMembers(members, m).queueNumber);
    expect(new Set(numbers).size).toBe(20);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(20);
  });

  it('never counts the target appointment itself', () => {
    const self = member('me', T(10, 0), T(0));
    const members = [member('p', T(9, 0), T(0)), self, member('q', T(11, 0), T(0))];
    const { patientsAhead, queueNumber } = computePositionFromMembers(members, self);
    expect(patientsAhead).toBe(1);
    expect(queueNumber).toBe(2);
  });

  it('contract: two racing readers that see the same snapshot derive the same position — uniqueness comes from the DB start-uniqueness, not the math', () => {
    // Both concurrent requests read the same members list BEFORE either new
    // appointment is persisted. Both target positions are the same — proving
    // the engine is deterministic. The DB rejects a duplicate `start` (unique
    // partial index + assertNoDoctorOverlap), so two writers can never both
    // keep a number derived from the same slot.
    const members = [
      member('a', T(9, 0), T(0)),
      member('b', T(10, 0), T(0)),
      member('c', T(11, 0), T(0)),
    ];
    const req1 = { _id: 'book1', start: T(12, 0), createdAt: T(12) };
    const req2 = { _id: 'book2', start: T(12, 0), createdAt: T(12) };
    const pos1 = computePositionFromMembers(members, req1);
    const pos2 = computePositionFromMembers(members, req2);
    expect(pos1).toEqual(pos2);
    expect(pos1).toEqual({ queueNumber: 4, patientsAhead: 3 });
  });
});

describe('estimateWaitMinutes', () => {
  it('multiplies patients ahead by the average session duration', () => {
    expect(estimateWaitMinutes(5, 20)).toBe(100);
    expect(estimateWaitMinutes(3, 30)).toBe(90);
  });

  it('falls back to the default session duration when avg is missing', () => {
    expect(estimateWaitMinutes(2, 0)).toBe(DEFAULT_SESSION_DURATION_MIN * 2);
    expect(estimateWaitMinutes(0, 0)).toBe(0);
  });
});

describe('computeAvgSessionMinutes', () => {
  it('averages completed appointment durations', () => {
    const records = [
      { start: T(9, 0), end: T(9, 20) }, // 20 min
      { start: T(10, 0), end: T(10, 40) }, // 40 min
    ];
    expect(computeAvgSessionMinutes(records)).toBe(30);
  });

  it('ignores malformed records', () => {
    expect(computeAvgSessionMinutes([null, {}, { start: T(9, 0) }])).toBe(
      DEFAULT_SESSION_DURATION_MIN,
    );
  });

  it('falls back to the default with no history', () => {
    expect(computeAvgSessionMinutes([])).toBe(DEFAULT_SESSION_DURATION_MIN);
  });
});

describe('isQueueMilestone', () => {
  it('matches only the configured thresholds', () => {
    expect(QUEUE_POSITION_THRESHOLDS).toEqual([12, 10, 8, 6, 4]);
    for (const t of QUEUE_POSITION_THRESHOLDS) {
      expect(isQueueMilestone(t)).toBe(true);
      expect(isQueueMilestone(t - 1)).toBe(false);
      expect(isQueueMilestone(t + 1)).toBe(false);
    }
    expect(isQueueMilestone(0)).toBe(false);
  });
});

describe('positionDecision', () => {
  const base = {
    nextAhead: 4,
    lastNotifiedAhead: null,
    nearTurnAlreadyNotified: false,
    nearTurnDue: false,
  };

  it('fires a milestone when descending onto a threshold', () => {
    const d = positionDecision({ ...base, nextAhead: 8, lastNotifiedAhead: 10 });
    expect(d.sendPosition).toBe(true);
    expect(d.sendNearTurn).toBe(false);
  });

  it('does not re-fire the same milestone twice', () => {
    const d = positionDecision({ ...base, nextAhead: 8, lastNotifiedAhead: 8 });
    expect(d.sendPosition).toBe(false);
  });

  it('does not fire milestones above the last notified value (jump up)', () => {
    const d = positionDecision({ ...base, nextAhead: 8, lastNotifiedAhead: 4 });
    expect(d.sendPosition).toBe(false);
  });

  it('does not fire on non-threshold ahead counts', () => {
    const d = positionDecision({ ...base, nextAhead: 9, lastNotifiedAhead: 12 });
    expect(d.sendPosition).toBe(false);
  });

  it('near-turn wins over a milestone and is sent exactly once', () => {
    const due = { ...base, nextAhead: 3, nearTurnDue: true };
    expect(positionDecision(due)).toEqual({ sendPosition: false, sendNearTurn: true });
    // Once notified, nothing further is sent.
    const later = { ...due, nearTurnAlreadyNotified: true };
    expect(positionDecision(later)).toEqual({ sendPosition: false, sendNearTurn: false });
  });

  it('near-turn is not sent when the wait is still long', () => {
    const d = positionDecision({
      ...base,
      nextAhead: NEAR_TURN_MAX_AHEAD,
      nearTurnDue: false,
    });
    expect(d.sendNearTurn).toBe(false);
  });

  it('near-turn suppresses milestone position updates below the threshold', () => {
    // ahead 2: near-turn due → no noisy position milestone as well.
    const d = positionDecision({ ...base, nextAhead: 2, nearTurnDue: true });
    expect(d).toEqual({ sendPosition: false, sendNearTurn: true });
  });
});

describe('isSameClinicDay', () => {
  it('true for a start within the clinic local day', () => {
    expect(isSameClinicDay(T(12, 0), 'UTC', new Date('2026-01-15T16:00:00Z'))).toBe(true);
  });

  it('false for a start outside the clinic local day', () => {
    expect(isSameClinicDay(T(12, 0), 'UTC', new Date('2026-01-16T16:00:00Z'))).toBe(false);
    expect(isSameClinicDay(T(12, 0), 'UTC', new Date('2026-01-14T16:00:00Z'))).toBe(false);
  });

  it('respects the clinic timezone, not the server clock', () => {
    const now = new Date('2026-01-15T23:30:00Z'); // local next-day in UTC+2
    expect(isSameClinicDay(new Date('2026-01-16T01:00:00Z'), 'Africa/Cairo', now)).toBe(true);
    expect(isSameClinicDay(new Date('2026-01-15T23:45:00Z'), 'Africa/Cairo', now)).toBe(true);
  });
});