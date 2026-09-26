import { describe, expect, it } from 'vitest';

import { buildPayload } from './invoicePayload.js';

/**
 * Regression coverage for the invoice edit payload.
 *
 * The bug: the server applies a field only when its key is present, so every
 * optional field was sent only when non-empty. Clearing the discount, tax, due
 * date or notes and pressing save looked like it worked but silently kept the
 * old value on the invoice.
 *
 * The counter-constraint matters just as much: the server rejects a paid invoice
 * with a 409 if *any* financial field appears in the payload, so an untouched
 * field must still be omitted.
 */

const item = { description: 'Scaling', quantity: 1, unitPrice: 100 };

const form = (overrides = {}) => ({
  items: [item],
  discount: '',
  discountType: 'fixed',
  discountRate: '',
  tax: '',
  taxRate: '',
  dueDate: '',
  notes: '',
  branch: '',
  ...overrides,
});

describe('buildPayload - clearing a field', () => {
  it('sends 0 for a discount that had a value and was emptied', () => {
    const payload = buildPayload(form({ discount: '' }), { discount: 50 });
    expect(payload.discount).toBe(0);
  });

  it('omits an untouched discount so a paid invoice is not rejected', () => {
    const payload = buildPayload(form({ discount: '' }), { discount: null });
    expect('discount' in payload).toBe(false);
  });

  it('sends the value when the user types one', () => {
    expect(buildPayload(form({ discount: '25' }), { discount: 50 }).discount).toBe(25);
  });

  it('clears notes by sending an empty string, not by omitting them', () => {
    const payload = buildPayload(form({ notes: '  ' }), { notes: 'split across visits' });
    expect(payload.notes).toBe('');
  });

  it('clears a due date with an explicit null', () => {
    const original = { dueDate: '2026-03-01T00:00:00.000Z' };
    expect(buildPayload(form({ dueDate: '' }), original).dueDate).toBeNull();
  });

  it('omits dueDate entirely when there was never one', () => {
    expect('dueDate' in buildPayload(form(), { dueDate: null })).toBe(false);
  });
});

describe('buildPayload - discount mode swap', () => {
  it('sends the rate in percentage mode', () => {
    const payload = buildPayload(
      form({ discountType: 'percentage', discountRate: '10', discount: '' }),
      { discountType: 'percentage', discountRate: 15 },
    );
    expect(payload.discountRate).toBe(10);
  });

  it('wipes a stale rate when switching back to fixed', () => {
    const payload = buildPayload(
      form({ discountType: 'fixed', discountRate: '10', discount: '20' }),
      { discountType: 'percentage', discountRate: 10 },
    );
    expect(payload.discountRate).toBe(0);
  });

  it('leaves an untouched fixed-mode invoice free of the rate field', () => {
    const payload = buildPayload(
      form({ discountType: 'fixed', discount: '20', discountRate: '' }),
      { discountType: 'fixed', discount: 20, discountRate: 0 },
    );
    expect('discountRate' in payload).toBe(false);
  });
});

describe('buildPayload - line items', () => {
  it('drops blank rows rather than posting empty descriptions', () => {
    const payload = buildPayload(
      form({ items: [item, { description: '  ', quantity: 2, unitPrice: 5 }] }),
      {},
    );
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].description).toBe('Scaling');
  });

  it('coerces non-numeric quantity and price to safe numbers', () => {
    const payload = buildPayload(
      form({ items: [{ description: 'X', quantity: 'abc', unitPrice: 'def' }] }),
      {},
    );
    expect(payload.items[0]).toEqual({ description: 'X', quantity: 1, unitPrice: 0 });
  });
});
