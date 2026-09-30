import { beforeEach, describe, expect, it } from 'vitest';

import {
  _resetGrantStore,
  consumeGrant,
  consumeHandoff,
  createHandoff,
  newGrantId,
  registerGrant,
  revokeGrant,
} from '../utils/impersonationGrant.js';

/**
 * Regression tests for the single-use impersonation grant registry.
 *
 * An impersonation grant is a bearer credential that mints a full clinic
 * session, so it must be redeemable exactly once. The JWT alone cannot enforce
 * that — it stays valid for its whole 30-minute lifetime — which is why the
 * `jti` is also recorded server-side and consumed atomically on redemption.
 */
describe('impersonationGrant', () => {
  beforeEach(() => {
    _resetGrantStore();
  });

  it('returns a unique id per grant', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newGrantId()));
    expect(ids.size).toBe(500);
  });

  it('allows a registered grant to be consumed exactly once', async () => {
    const jti = newGrantId();
    await registerGrant(jti);

    expect(await consumeGrant(jti)).toBe(true);
    expect(await consumeGrant(jti)).toBe(false);
  });

  it('rejects a grant that was never registered', async () => {
    expect(await consumeGrant(newGrantId())).toBe(false);
  });

  it('rejects a replay of an already-consumed grant', async () => {
    const jti = newGrantId();
    await registerGrant(jti);

    const first = await consumeGrant(jti);
    const replay = await consumeGrant(jti);

    expect(first).toBe(true);
    expect(replay).toBe(false);
  });

  it('rejects consumption after the grant is revoked', async () => {
    const jti = newGrantId();
    await registerGrant(jti);
    await revokeGrant(jti);

    expect(await consumeGrant(jti)).toBe(false);
  });

  it('rejects an empty/missing jti without throwing', async () => {
    expect(await consumeGrant('')).toBe(false);
    expect(await consumeGrant(null)).toBe(false);
    expect(await consumeGrant(undefined)).toBe(false);
  });

  it('treats independently issued grants as distinct', async () => {
    const a = newGrantId();
    const b = newGrantId();
    await registerGrant(a);
    await registerGrant(b);

    expect(await consumeGrant(a)).toBe(true);
    // Issuing/consuming one grant must not disturb the other.
    expect(await consumeGrant(b)).toBe(true);
  });

  it('rejects an expired grant', async () => {
    const jti = newGrantId();
    // Negative TTL makes the stored entry already expired.
    await registerGrant(jti, -1);

    expect(await consumeGrant(jti)).toBe(false);
  });
});

/**
 * The dashboard and the clinic login page are different origins, so a URL is
 * the only channel between them. The URL therefore carries a `handoffCode`
 * rather than the grant, so a leaked link (history, Referer, proxy log) is
 * useless: the code is single-use and expires in 60 seconds.
 */
describe('impersonation handoff code', () => {
  beforeEach(() => {
    _resetGrantStore();
  });

  it('returns the grant behind a code', async () => {
    const code = await createHandoff('grant-abc');
    expect(await consumeHandoff(code)).toBe('grant-abc');
  });

  it('does not put the grant itself in the code', async () => {
    const code = await createHandoff('super-secret-grant');
    // The code is server-side state, not an encoded copy of the grant.
    expect(code).not.toContain('super-secret-grant');
    expect(code).not.toContain('secret');
  });

  it('is single-use', async () => {
    const code = await createHandoff('grant-abc');

    expect(await consumeHandoff(code)).toBe('grant-abc');
    expect(await consumeHandoff(code)).toBeNull();
  });

  it('returns null for an unknown code', async () => {
    expect(await consumeHandoff('never-issued')).toBeNull();
  });

  it('returns null for a missing code instead of throwing', async () => {
    expect(await consumeHandoff('')).toBeNull();
    expect(await consumeHandoff(null)).toBeNull();
    expect(await consumeHandoff(undefined)).toBeNull();
  });

  it('issues a distinct code per handoff', async () => {
    const codes = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createHandoff(`grant-${i}`)),
    );
    expect(new Set(codes).size).toBe(50);
  });

  it('consuming one code leaves the others redeemable', async () => {
    const a = await createHandoff('grant-a');
    const b = await createHandoff('grant-b');

    expect(await consumeHandoff(a)).toBe('grant-a');
    expect(await consumeHandoff(b)).toBe('grant-b');
  });
});
