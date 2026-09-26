import { describe, expect, it } from 'vitest';

import { shouldEndSession } from './axios.js';

/**
 * Regression coverage for the logout policy in the response interceptor.
 *
 * The bug: when `POST /auth/refresh` failed for ANY reason, the catch block
 * called `redirectToLogin()`. A dropped connection, DNS failure or timeout
 * rejects with no `response` at all, so a transient network blip destroyed a
 * still-valid session. The session must only end when the server actually
 * rejected the token.
 */

/** An error shaped like axios produces for an HTTP status. */
const httpError = (status) => ({ response: { status, data: {} } });

/** An error shaped like axios produces when no response was received. */
const transportError = (message) => {
  const e = new Error(message);
  e.isAxiosError = true;
  return e;
};

describe('shouldEndSession', () => {
  it('ends the session when refresh is rejected as unauthorized', () => {
    expect(shouldEndSession(httpError(401))).toBe(true);
  });

  it('ends the session when refresh is forbidden', () => {
    expect(shouldEndSession(httpError(403))).toBe(true);
  });

  it.each([
    ['the network is down', transportError('Network Error')],
    ['the request timed out', transportError('timeout of 10000ms exceeded')],
    ['DNS resolution failed', transportError('getaddrinfo ENOTFOUND api.example.com')],
    ['the browser blocked it (CORS/offline)', transportError('ERR_NETWORK')],
  ])('does NOT end the session when %s', (_label, err) => {
    expect(shouldEndSession(err)).toBe(false);
  });

  it('does not end the session for a non-auth server error', () => {
    // A 500 is a server fault, not a revoked session; bouncing the user to
    // /login would not help and would lose their work.
    expect(shouldEndSession(httpError(500))).toBe(false);
    expect(shouldEndSession(httpError(404))).toBe(false);
    expect(shouldEndSession(httpError(429))).toBe(false);
  });

  it('tolerates a missing or malformed error object', () => {
    expect(shouldEndSession(undefined)).toBe(false);
    expect(shouldEndSession(null)).toBe(false);
    expect(shouldEndSession({})).toBe(false);
  });
});
