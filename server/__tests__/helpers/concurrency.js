/**
 * Reusable concurrency helpers for proving atomicity/idempotency claims under
 * REAL concurrent load. Any test file in this repo can import these.
 *
 * ============================================================================
 * ⚠️ THE FALSE-NEGATIVE TRAP — READ BEFORE USING ⚠️
 * ============================================================================
 * A concurrency test is ONLY meaningful if the requests genuinely run
 * simultaneously. The classic mistake is to `await` inside the loop that
 * builds the array of requests:
 *
 *   // ❌ WRONG — this is SEQUENTIAL, not concurrent:
 *   const responses = [];
 *   for (let i = 0; i < 10; i++) {
 *     responses.push(await requestFactory());   // awaits → serializes
 *   }
 *
 *   // ✅ CORRECT — build all promises first, THEN await them together:
 *   const promises = Array.from({ length: 10 }, () => requestFactory());
 *   const responses = await Promise.all(promises);
 *
 * The sequential version will silently turn an atomic-claim test into a
 * "they ran one at a time" test, which always passes and proves nothing.
 * `Array.from({ length: N }, () => requestFactory())` calls `requestFactory()`
 * N times synchronously, so all N HTTP requests are in flight before any of
 * them resolve — THAT is real concurrency.
 *
 * Both helpers below follow this contract. `requestFactory` (and `fn`) MUST
 * return a NEW promise each call — never a shared/cached promise.
 * ============================================================================
 */

/**
 * Fire N concurrent requests against the same endpoint/action and assert on the
 * aggregate outcome — used to prove atomic claim/release patterns hold under
 * real concurrency, not just sequential test order.
 *
 * Results are bucketed by status-code family so a test can assert e.g.
 * "exactly 1 of 5 succeeded, the other 4 got 409" — the actual shape of a
 * correct atomic-claim test.
 *
 * @param {() => Promise<import('supertest').Response>} requestFactory
 *   returns a NEW promise each call (e.g. () => request(app).post('/api/...').set(authHeader))
 * @param {number} [concurrency=10] how many simultaneous calls to fire
 * @param {object} [expect]
 * @param {number} [expect.exactlySuccessful] assert precisely this many
 *   resolve with a success status (2xx)
 * @param {number} [expect.exactlyConflict] assert precisely this many resolve
 *   with the given conflict status
 * @param {number} [expect.conflictStatus=409] which status counts as "conflict"
 * @returns {Promise<{successes: Array, conflicts: Array, others: Array}>}
 */
export async function runConcurrent(requestFactory, concurrency = 10, expect = {}) {
  // Build ALL the promises FIRST (synchronously) so they are in flight
  // together. Do NOT await in this loop — that would serialize the requests
  // and the "concurrent" test would falsely pass (see header).
  const requests = Array.from({ length: concurrency }, () => requestFactory());
  const results = await Promise.allSettled(requests);

  const successes = [];
  const conflicts = [];
  const others = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      others.push(result.reason);
      continue;
    }
    const res = result.value;
    const status = typeof res === 'object' && res !== null ? Number(res.status) : NaN;
    if (status >= 200 && status < 300) {
      successes.push(res);
    } else if (status === expect.conflictStatus) {
      conflicts.push(res);
    } else {
      others.push(res);
    }
  }

  if (expect.exactlySuccessful !== undefined) {
    if (successes.length !== expect.exactlySuccessful) {
      throw new Error(
        `expected exactly ${expect.exactlySuccessful} successes, got ${successes.length} ` +
        `(conflicts=${conflicts.length}, others=${others.length})`,
      );
    }
  }

  if (expect.exactlyConflict !== undefined) {
    if (conflicts.length !== expect.exactlyConflict) {
      throw new Error(
        `expected exactly ${expect.exactlyConflict} conflicts, got ${conflicts.length} ` +
        `(successes=${successes.length}, others=${others.length})`,
      );
    }
  }

  return { successes, conflicts, others };
}

/**
 * DB/service-level variant — for bugs provable without going through HTTP, by
 * calling a service function directly N times concurrently against a shared
 * document (e.g. rotateSiteAdminToken, generateInvoiceFromPlan).
 *
 * Same simultaneity contract as `runConcurrent`.
 *
 * @param {() => Promise<any>} fn returns a NEW promise each call
 * @param {number} [concurrency=10]
 * @returns {Promise<{fulfilled: Array<{value: any}>, rejected: Array<{reason: any}>}>}
 */
export async function runConcurrentCalls(fn, concurrency = 10) {
  const calls = Array.from({ length: concurrency }, () => fn());
  const settled = await Promise.allSettled(calls);

  const fulfilled = [];
  const rejected = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      fulfilled.push({ value: result.value });
    } else {
      rejected.push({ reason: result.reason });
    }
  }

  return { fulfilled, rejected };
}

export default { runConcurrent, runConcurrentCalls };
