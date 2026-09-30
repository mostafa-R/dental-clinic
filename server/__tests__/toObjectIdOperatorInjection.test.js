import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { toObjectId } from '../utils/branchScope.js';

/**
 * MEDIUM-7: `toObjectId` used to return any unconvertible value unchanged.
 *
 * With Mongoose 9 (`strictQuery: false`) that let a Mongo operator reach the
 * query filter: `?branch[$ne]=null` became `{ branch: { $ne: null } }`, which
 * turns a branch-narrowed filter into "every branch" — the exact opposite of
 * the intent of the branch scope applied around it.
 */
describe('toObjectId', () => {
  const oid = '507f1f77bcf86cd7994390aa';

  it('converts a valid ObjectId string', () => {
    const result = toObjectId(oid);
    expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(result)).toBe(oid);
  });

  it('passes an ObjectId through', () => {
    const input = new mongoose.Types.ObjectId(oid);
    expect(String(toObjectId(input))).toBe(oid);
  });

  it('unwraps a populated document to its _id', () => {
    const result = toObjectId({ _id: oid, name: 'Main Branch' });
    expect(String(result)).toBe(oid);
  });

  it('rejects a Mongo operator object instead of widening the filter', () => {
    // The exploit: this used to be returned verbatim as `{ $ne: null }`.
    expect(() => toObjectId({ $ne: null })).toThrow(/Invalid identifier/);
  });

  it('rejects $gt/$in operator objects', () => {
    expect(() => toObjectId({ $gt: oid })).toThrow(/Invalid identifier/);
    expect(() => toObjectId({ $in: [oid] })).toThrow(/Invalid identifier/);
  });

  it('rejects a nested operator hidden behind a _id key', () => {
    expect(() => toObjectId({ _id: { $ne: null } })).toThrow(/Invalid identifier/);
  });

  it('rejects an empty object', () => {
    expect(() => toObjectId({})).toThrow(/Invalid identifier/);
  });

  it('keeps nullish values so optional filters stay optional', () => {
    expect(toObjectId(null)).toBeNull();
    expect(toObjectId(undefined)).toBeUndefined();
    expect(toObjectId('')).toBe('');
  });

  it('still forwards an opaque non-ObjectId string as a literal match', () => {
    // Mongoose matches this as equality, which cannot widen a filter.
    expect(toObjectId('branch-b2')).toBe('branch-b2');
  });
});
