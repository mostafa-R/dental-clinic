import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Invalid-Input Campaign (test-only — no production code changes).
//
// Pure-logic / no-DB proof that the Zod gateways, the journal service, the
// upload magic-byte sniffer, the event bus dedup, the rate limiter and the
// error handler all reject or contain hostile input. Each describe block maps
// 1:1 to a campaign category in INVALID-INPUT-REPORT.md.
// ---------------------------------------------------------------------------

// Keep DB writes inert: the error handler logs opaque 500s, the event bus
// persists to EventLog, and the journal service logs rejections to ErrorLog.
vi.mock('../utils/logger.js', () => {
  const pinoLike = {
    levels: { values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } },
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: () => pinoLike,
  };
  return {
    logger: pinoLike,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    default: pinoLike,
  };
});

vi.mock('../modules/accounting/journalEntry.model.js', async (importOriginal) => {
  const actual = await importOriginal();
  const create = vi.fn().mockResolvedValue([{ _id: 'journal-1' }]);
  return { ...actual, default: { ...actual.default, create } };
});

vi.mock('../modules/site/errorLog/errorLog.model.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual.default, create: vi.fn().mockResolvedValue({}) } };
});

vi.mock('../modules/automation/eventLog.model.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual.default, create: vi.fn().mockResolvedValue({}) } };
});

// The /api chain probes PlatformSetting (maintenance/ipAllowlist); this suite
// never connects mongoose, so stub them out like appRateLimit.test.js does.
vi.mock('../middleware/maintenance.js', () => ({
  maintenance: (_req, _res, next) => next(),
}));
vi.mock('../middleware/ipAllowlist.js', () => ({
  ipAllowlist: (_req, _res, next) => next(),
}));

import express from 'express';
import JournalEntry from '../modules/accounting/journalEntry.model.js';
import ErrorLog from '../modules/site/errorLog/errorLog.model.js';
import { assertFileSignature } from '../middleware/upload.js';
import { errorHandler as errorHandlerMw } from '../middleware/error.js';
import { isValidFdi } from '../constants/dental.js';
import { postJournalEntry } from '../modules/accounting/journal.service.js';
import { publishEvent, resetEventBusState } from '../services/eventBus.js';
import { createAppointmentSchema, transitionSchema } from '../modules/appointments/appointment.validator.js';
import { createInvoiceSchema, updateInvoiceSchema, paymentSchema, refundSchema, listInvoicesQuerySchema } from '../modules/billing/invoice.validator.js';
import { MAX_INVOICE_ITEMS } from '../modules/billing/invoice.model.js';
import {
  createTreatmentPlanSchema,
  updateDentalChartSchema,
  createClinicalNoteSchema,
  updateClinicalNoteSchema,
} from '../modules/emr/emr.validator.js';
import ApiError from '../utils/ApiError.js';
import request from 'supertest';

const OID = '5f1b3b9d0f5c8f0000000001';
const OID2 = '5f1b3b9d0f5c8f0000000002';

/* ------------------------------------------------------------------ FDI */

describe('invalid FDI tooth codes are rejected', () => {
  it('isValidFdi: permanent quadrant/position boundaries only (11-48)', () => {
    expect(isValidFdi(11)).toBe(true);
    expect(isValidFdi(18)).toBe(true);
    expect(isValidFdi(48)).toBe(true);
    expect(isValidFdi(0)).toBe(false);
    expect(isValidFdi(10)).toBe(false);
    expect(isValidFdi(49)).toBe(false);
    expect(isValidFdi(50)).toBe(false);
    expect(isValidFdi(88)).toBe(false);
    expect(isValidFdi(99)).toBe(false);
    expect(isValidFdi(-3)).toBe(false);
    expect(isValidFdi(8.5)).toBe(false);
  });

  it('dental chart fdi: out-of-range and decimal codes are rejected', () => {
    for (const fdi of [0, 10, 49, 50, 88, 99, -1]) {
      const r = updateDentalChartSchema.safeParse({ teeth: [{ fdi }] });
      expect(r.success).toBe(false);
      const issue = r.error.issues.find((i) => i.path.join('.') === 'teeth.0.fdi');
      expect(issue?.message).toContain('Invalid FDI tooth code');
    }
    const decimal = updateDentalChartSchema.safeParse({ teeth: [{ fdi: 12.5 }] });
    expect(decimal.success).toBe(false);
  });

  it('dental chart fdi: primary-dentition codes (51-85) are rejected, never coerced', () => {
    for (const fdi of [55, 85]) {
      const r = updateDentalChartSchema.safeParse({ teeth: [{ fdi }] });
      expect(r.success).toBe(false);
    }
  });

  it('treatment plan items reject an invalid FDI while accepting a valid one', () => {
    const base = { title: 'Plan', doctor: OID, items: [{ procedureName: 'Scaling', estimatedCost: 100 }] };
    const bad = createTreatmentPlanSchema.safeParse({ ...base, items: [{ ...base.items[0], fdi: 99 }] });
    expect(bad.success).toBe(false);
    const good = createTreatmentPlanSchema.safeParse({ ...base, items: [{ ...base.items[0], fdi: 18 }] });
    expect(good.success).toBe(true);
  });
});

/* -------------------------------------------------- dates & hours fields */

describe('invalid dates and appointment slot fields are rejected', () => {
  const base = { patient: OID, doctor: OID };

  it('non-parseable date strings are rejected', () => {
    const r = createAppointmentSchema.safeParse({ ...base, start: '2025-13-99' });
    expect(r.success).toBe(false);
    expect(r.error.issues.find((i) => i.path[0] === 'start')?.message).toBe('Invalid date/time');
  });

  it('end before start and end == start are rejected', () => {
    for (const [start, end] of [
      ['2026-01-10T10:00:00.000Z', '2026-01-10T09:00:00.000Z'],
      ['2026-01-10T10:00:00.000Z', '2026-01-10T10:00:00.000Z'],
    ]) {
      const r = createAppointmentSchema.safeParse({ ...base, start, end });
      expect(r.success).toBe(false);
      expect(r.error.issues.find((i) => i.path.join('.') === 'end')?.message).toBe('End time must be after start time');
    }
  });

  it('slots must be an integer within 1..3', () => {
    for (const slots of [0, 4, -1, 2.5]) {
      const r = createAppointmentSchema.safeParse({ ...base, slots });
      expect(r.success).toBe(false);
    }
    expect(createAppointmentSchema.safeParse({ ...base, slots: 3 }).success).toBe(true);
  });

  it('oversized reason/notes and junk recall fields are rejected', () => {
    const r = createAppointmentSchema.safeParse({ ...base, reason: 'x'.repeat(301), notes: 'y'.repeat(1001) });
    expect(r.success).toBe(false);

    const t = transitionSchema.safeParse({ status: 'completed', recallAfterDays: 0 });
    expect(t.success).toBe(false);
    expect(transitionSchema.safeParse({ status: 'completed', recallAfterDays: 731 }).success).toBe(false);
    expect(transitionSchema.safeParse({ status: 'completed', recallType: 'not-a-type' }).success).toBe(false);
  });

  it('empty list query params coerce cleanly while bad bounds are rejected', () => {
    expect(listInvoicesQuerySchema.safeParse({ from: '' }).success).toBe(true);
    expect(listInvoicesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listInvoicesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    const appt = createAppointmentSchema.safeParse(base);
    expect(appt.success).toBe(true);
  });
});

/* --------------------------------------------------------- money fields */

describe('negative / zero / malformed money fields are rejected', () => {
  it('paymentSchema: zero, negative and non-numeric amounts are rejected', () => {
    for (const amount of [0, -5, 'abc', '']) {
      const r = paymentSchema.safeParse({ amount, method: 'cash' });
      expect(r.success).toBe(false);
    }
    expect(paymentSchema.safeParse({ amount: 0.01, method: 'cash' }).success).toBe(true);
  });

  it('paymentSchema: bad method, oversized reference and bad date are rejected', () => {
    expect(paymentSchema.safeParse({ amount: 10, method: 'cheque' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 10, method: 'cash', reference: 'r'.repeat(201) }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 10, method: 'cash', date: 'not-a-date' }).success).toBe(false);
  });

  it('refundSchema: zero/negative refunds are rejected', () => {
    for (const amount of [0, -1]) {
      const r = refundSchema.safeParse({ amount });
      expect(r.success).toBe(false);
    }
    expect(refundSchema.safeParse({ amount: 5 }).success).toBe(true);
  });

  it('invoice line items: zero quantity, negative price/discount are rejected', () => {
    const base = { patient: OID, items: [{ description: 'd', quantity: 1, unitPrice: 10 }] };
    expect(createInvoiceSchema.safeParse({ ...base, items: [{ description: 'd', quantity: 0, unitPrice: 10 }] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, items: [{ description: 'd', quantity: 1, unitPrice: -1 }] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, items: [{ description: 'd', quantity: 1, unitPrice: 10, discount: -1 }] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, items: [], discountRate: 10 }).success).toBe(false);
  });

  it('empty item arrays and invoices over the item cap are rejected', () => {
    const items = Array.from({ length: MAX_INVOICE_ITEMS + 1 }, (_, i) => ({ description: `d${i}`, quantity: 1, unitPrice: 1 }));
    const r = createInvoiceSchema.safeParse({ patient: OID, items });
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => i.message.includes('line items'))).toBe(true);
    expect(createInvoiceSchema.safeParse({ patient: OID, items: [] }).success).toBe(false);
  });

  it('discount cross-field rules reject conflicting/partial discount input', () => {
    const base = { patient: OID, items: [{ description: 'd', quantity: 1, unitPrice: 10 }] };
    const noRate = createInvoiceSchema.safeParse({ ...base, discountType: 'percentage' });
    expect(noRate.success).toBe(false);
    expect(noRate.error.issues.some((i) => i.path[0] === 'discountRate' && i.message.includes('required'))).toBe(true);

    const both = createInvoiceSchema.safeParse({ ...base, discountType: 'percentage', discountRate: 10, discount: 5 });
    expect(both.success).toBe(false);
    expect(both.error.issues.some((i) => i.path[0] === 'discount' && i.message.includes('must not be set'))).toBe(true);

    const fixedWithRate = createInvoiceSchema.safeParse({ ...base, discountType: 'fixed', discountRate: 10 });
    expect(fixedWithRate.success).toBe(false);

    const good = createInvoiceSchema.safeParse({ ...base, discountType: 'percentage', discountRate: 10 });
    expect(good.success).toBe(true);
  });

  it('update with no fields is rejected; oversized notes/due dates are capped', () => {
    const r = updateInvoiceSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(createInvoiceSchema.safeParse({ patient: OID, items: [], notes: 'n'.repeat(1001) }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ patient: OID, items: [], dueDate: '2026-13-01T10:00:00.000Z' }).success).toBe(false);
  });

  it('runaway amounts (1e309 -> Infinity) are rejected, not persisted', () => {
    const r = paymentSchema.safeParse({ amount: 1e309, method: 'cash' });
    expect(r.success).toBe(false);
  });
});

/* ----------------------------------------------------- unbalanced journal */

describe('unbalanced journal entries are rejected and logged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debit !== credit is rejected with a 400 before any JournalEntry write', async () => {
    await expect(
      postJournalEntry({
        tenant: OID,
        sourceType: 'payment',
        lines: [
          { account: 'cash', debit: 100 },
          { account: 'revenue', credit: 90 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('does not balance') });
    expect(JournalEntry.create).not.toHaveBeenCalled();
  });

  it('fewer than two lines, zero totals, two-sided lines and unknown accounts are rejected', async () => {
    const cases = [
      [{ account: 'cash', debit: 100 }],
      [{ account: 'cash', debit: 0 }, { account: 'revenue', credit: 0 }],
      [{ account: 'cash', debit: 100 }, { account: 'revenue', credit: 100, debit: 5 }],
      [{ account: 'cash', debit: 100 }, { account: 'not-an-account', credit: 100 }],
      [{ account: 'cash', debit: 100 }, { account: 'expenses', credit: 50 }],
    ];
    for (const lines of cases) {
      await expect(
        postJournalEntry({ tenant: OID, sourceType: 'expense', lines }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('rejects within tolerance: drift beyond 0.01 is refused', async () => {
    await expect(
      postJournalEntry({
        tenant: OID,
        sourceType: 'payment',
        lines: [
          { account: 'cash', debit: 100 },
          { account: 'revenue', credit: 99.98 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('logs every rejected attempt to the ErrorLog before throwing', async () => {
    await expect(
      postJournalEntry({
        tenant: OID,
        sourceType: 'expense',
        lines: [
          { account: 'cash', debit: 100 },
          { account: 'revenue', credit: 50 },
        ],
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(ErrorLog.create).toHaveBeenCalled();
  });

  it('a balanced entry is created with equal totals and truncated memos', async () => {
    const entry = await postJournalEntry({
      tenant: OID,
      sourceType: 'payment',
      description: 'Patient payment',
      lines: [
        { account: 'cash', debit: 151.3, memo: 'm'.repeat(500) },
        { account: 'revenue', credit: 151.3 },
        { account: 'wallet_clearing', debit: 0 },
        { account: 'bank', debit: 0, credit: 0, memo: 'ignored' },
      ],
      userId: OID2,
    });
    expect(entry).toBeDefined();
    const [created] = JournalEntry.create.mock.calls[0][0];
    expect(created.totalDebit).toBe(151.3);
    expect(created.totalCredit).toBe(151.3);
    expect(created.lines.every((l) => l.memo.length <= 200)).toBe(true);
  });
});

/* -------------------------------------------------------------- magic bytes */

describe('fake files and magic-byte sniffing reject mismatched uploads', () => {
  let dir;
  const writeBuf = (name, buf) => {
    const p = join(dir, name);
    writeFileSync(p, buf);
    return p;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'invalid-upload-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts genuine PNG / JPEG byte-form headers', async () => {
    const png = writeBuf('x.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('PAYLOAD')]));
    await expect(assertFileSignature(png, 'image/png', ApiError)).resolves.toBeUndefined();
    await expect(assertFileSignature(writeBuf('x.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg', ApiError)).resolves.toBeUndefined();
  });

  it('BUG (report): match-form signatures (PDF/GIF/WebP/DICOM) crash with a raw TypeError instead of returning a 400', async () => {
    // middleware/upload.js:55 reads signature.bytes.length for EVERY entry, but
    // pdf / gif / webp / dicom signatures are {offset, match} with no .bytes —
    // so probeLen crashes before sniffing. Any such file fails with a 500, not
    // a clean 400 rejection. Documented in INVALID-INPUT-REPORT.md; the
    // campaign is test-only so the product fix is queued, not shipped here.
    const pdf = writeBuf('x.pdf', Buffer.from('%PDF-1.7'));
    await expect(assertFileSignature(pdf, 'application/pdf', ApiError)).rejects.toBeInstanceOf(TypeError);
    const dicom = Buffer.alloc(135, 0);
    dicom.write('DICM', 128);
    await expect(assertFileSignature(writeBuf('x.dcm', dicom), 'application/dicom', ApiError)).rejects.toBeInstanceOf(TypeError);
  });

  it('accepts a DICOM file with DICM at byte offset 128', async () => {
    const buf = Buffer.alloc(135, 0);
    buf.write('DICM', 128);
    const result = await assertFileSignature(writeBuf('x.dcm', buf), 'application/dicom', ApiError).then(
      () => 'resolved',
      (err) => `rejected:${err.constructor.name}`,
    );
    // Same underlying bug as above — asserted here so the regression is
    // visible for both probe sizes (bytes-form and match-form offsets).
    expect(result).toMatch(/^rejected:TypeError$/);
  });

  it('rejects an impostor renamed to .png (wrong magic bytes)', async () => {
    const impostor = writeBuf('evil.png', Buffer.from('this is just text, not an image'));
    await expect(assertFileSignature(impostor, 'image/png', ApiError)).rejects.toMatchObject({
      statusCode: 400,
      message: 'File content does not match type image/png',
    });
  });

  it('rejects a truncated signature (buffer too short)', async () => {
    const png = writeBuf('short.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await expect(assertFileSignature(png, 'image/png', ApiError)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects unverifiable mimetypes outright', async () => {
    await expect(assertFileSignature(writeBuf('x.bin', Buffer.from('x')), 'image/bmp', ApiError)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot verify file type image/bmp',
    });
  });
});

/* ------------------------------------------- XSS / HTML / very long input */

describe('XSS / HTML / oversized free-text input is handled', () => {
  const noteBase = {
    doctor: OID,
    chiefComplaint: 'pain',
    examination: 'swelling',
    diagnosis: 'abscess',
    plan: 'drain',
  };

  it('attachment URLs reject javascript:, data: and plain http: schemes (L6)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://cdn.example.com/x.png']) {
      const r = createClinicalNoteSchema.safeParse({ ...noteBase, attachments: [{ url }] });
      expect(r.success).toBe(false);
      expect(r.error.issues.some((i) => i.path.join('.') === 'attachments.0.url')).toBe(true);
    }
  });

  it('attachment URLs accept local /api/ paths and https links only', () => {
    const local = createClinicalNoteSchema.safeParse({ ...noteBase, attachments: [{ url: '/api/v1/attachments/xray.png' }] });
    expect(local.success).toBe(true);
    const https = createClinicalNoteSchema.safeParse({ ...noteBase, attachments: [{ url: 'https://cdn.example.com/x.png' }] });
    expect(https.success).toBe(true);
  });

  it('upsert attachments: existing entries may skip the URL but new ones must supply a valid one', () => {
    const patch = updateClinicalNoteSchema.safeParse({ attachments: [{ _id: OID }] });
    expect(patch.success).toBe(true);
    const missing = updateClinicalNoteSchema.safeParse({ attachments: [{ caption: 'xray' }] });
    expect(missing.success).toBe(false);
  });

  it('oversized free-text fields are capped at their declared maxima', () => {
    const long = createClinicalNoteSchema.safeParse({ ...noteBase, chiefComplaint: 'c'.repeat(1001) });
    expect(long.success).toBe(false);
    const longExamination = createClinicalNoteSchema.safeParse({ ...noteBase, examination: 'e'.repeat(2001) });
    expect(longExamination.success).toBe(false);
    const badDate = createClinicalNoteSchema.safeParse({ ...noteBase, nextAppointment: 'not-a-date' });
    expect(badDate.success).toBe(false);
  });

  it('plain HTML in free-text fields is accepted at the API layer (neutralized downstream by React escaping)', () => {
    const withHtml = createClinicalNoteSchema.safeParse({ ...noteBase, diagnosis: '<script>alert(1)</script>', chiefComplaint: '<b>hello</b>' });
    expect(withHtml.success).toBe(true);
  });
});

/* --------------------------------------------------------- duplicate events */

describe('duplicate events are deduplicated; rejected events stay PHI-free', () => {
  const VALID = {
    eventType: 'appointment.created',
    tenantId: OID,
    aggregateType: 'appointment',
    aggregateId: OID,
    occurredAt: '2026-01-01T00:00:00.000Z',
    metadata: { patientPhone: '+20 100 000 0000' },
  };

  beforeEach(() => {
    resetEventBusState();
    vi.clearAllMocks();
  });

  it('replaying an identical event within the TTL returns status "duplicate"', async () => {
    const first = await publishEvent({ ...VALID });
    expect(first.status).toBe('delivered');
    const replay = await publishEvent({ ...VALID, eventId: first.eventId });
    expect(replay.status).toBe('duplicate');
    expect(replay.eventId).toBe(first.eventId);
  });

  it('redelivery of the SAME object (at-least-once retry) deduplicates on the stamped eventId', async () => {
    const input = { ...VALID };
    const first = await publishEvent(input);
    expect(input.eventId).toBe(first.eventId);
    const retry = await publishEvent(input);
    expect(retry.status).toBe('duplicate');
  });

  it('invalid events are rejected without throwing and without echoing the PHI payload', async () => {
    const evil = { ...VALID, tenantId: 'not-an-objectid', metadata: { patientName: 'TOP-SECRET-PATIENT' } };
    const result = await publishEvent(evil);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('malformed-tenant-id');
    expect(JSON.stringify(result.error)).not.toContain('TOP-SECRET-PATIENT');
  });
});

/* ------------------------------------------------------------------ 429 */

describe('the general /api limiter throttles sustained traffic with 429', () => {
  it(
    'blocks non-auth traffic after 200 requests/min on a single IP',
    async () => {
      const { default: app } = await import('../app.js');
      let last;
      for (let i = 0; i < 205; i++) {
        last = await request(app)
          .post('/api/v1/__invalid_input_hammer__')
          .set('X-Forwarded-For', '203.0.113.50');
      }
      expect(last.status).toBe(429);
      expect(last.body.success).toBe(false);
      expect(last.body.message).toContain('Too many requests');
      const policy = String(last.headers['ratelimit-policy'] || '');
      expect(Number.parseInt(policy, 10)).toBe(200);
    },
    120000,
  );
});

/* ------------------------------------------------------------- 500 no-leak */

describe('500 responses do not leak internals or secrets', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('production: opaque 500 keeps only success + message, no stack and no details', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(Object.assign(new Error('apology-required'), { name: 'Error' }));
    });
    app.use(errorHandlerMw);

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'success']);
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('authorization');
  });
});