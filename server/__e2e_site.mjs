import mongoose from 'mongoose';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const BASE = 'http://localhost:7000';
const EMAIL = process.env.SEED_SITEADMIN_EMAIL;
const PASSWORD = process.env.SEED_SITEADMIN_PASSWORD;
const runTs = Date.now();

// ---------- tiny test harness ----------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}
function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== E2E SITE SUMMARY: ${results.length - failed.length}/${results.length} passed ====`);
  for (const f of failed) console.log(`  FAIL  ${f.name}  ${f.detail}`);
  if (failed.length) process.exitCode = 1;
  else console.log('All scenarios passed.');
}

// ---------- base32 + TOTP (RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  s = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) %
    1000000;
  return String(code).padStart(6, '0');
}
function totp(secret, stepOffset = 0) {
  return hotp(secret, Math.floor(Date.now() / 1000 / 30) + stepOffset);
}

// ---------- cookie jar ----------
const jar = new Map();
const jarSnapshot = () => new Map(jar);
const jarRestore = (snap) => { jar.clear(); for (const [k, v] of snap) jar.set(k, v); };
function parseCookies(res) {
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const raw of setCookie) {
    const parts = raw.split(';');
    const [name, ...rest] = parts[0].split('=');
    const value = rest.join('=');
    const attrs = parts.slice(1).map((p) => p.trim());
    const maxAge = attrs.find((a) => /^max-age=/i.test(a));
    const expires = attrs.find((a) => /^expires=/i.test(a));
    const expired =
      (maxAge && Number(maxAge.split('=')[1]) <= 0) ||
      (expires && new Date(expires.split('=').slice(1).join('=')) < new Date());
    if (expired || value === '') jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---------- HTTP client ----------
async function req(method, urlPath, { body, noToken = false, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (!headers.Cookie && jar.size > 0) headers.Cookie = cookieHeader();
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (unsafe && !noToken && !headers['X-CSRF-Token'] && jar.has('_csrf')) {
    headers['X-CSRF-Token'] = jar.get('_csrf');
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  parseCookies(res);
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// ---------- run ----------
let createdTenantId, createdTenantEmail;

try {
  if (!EMAIL || !PASSWORD) throw new Error('SEED_SITEADMIN_EMAIL/PASSWORD missing');
  await mongoose.connect(process.env.MONGO_URI);
  const { default: SiteAdmin } = await import('./modules/site/admin/admin.model.js');
  const admin = await SiteAdmin.findOne({ email: EMAIL }).select('+twoFactorSecret').lean();
  if (!admin) throw new Error('Seeded site admin not found');
  const secret = admin.twoFactorSecret;
  check('seed: 2FA enabled with TOTP secret', !!admin.twoFactorEnabled && !!secret);

  // S1 unauthenticated protected route
  let r = await req('GET', '/api/v1/site/tenants');
  check('S1 unauth GET /tenants -> 401', r.status === 401, `status=${r.status}`);

  // S2 login wrong password -> 401
  r = await req('POST', '/api/v1/site/auth/login', { body: { email: EMAIL, password: 'Correcth0rse!2' } });
  check('S2 wrong password -> 401', r.status === 401, `status=${r.status}`);

  // S3 login correct -> 2FA challenge (no cookies)
  r = await req('POST', '/api/v1/site/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check(
    'S3 super admin login -> 2FA challenge',
    r.status === 200 && r.json?.data?.requires2fa === true && !!r.json?.data?.challengeToken && !!r.json?.data?.adminId,
    `status=${r.status} requires2fa=${r.json?.data?.requires2fa}`,
  );
  check('S3 no session cookies while 2FA pending', !jar.has('site_access'), `cookies=${[...jar.keys()].join(',') || 'none'}`);
  const adminId = r.json.data.adminId;
  const challengeA = r.json.data.challengeToken;

  // S4 verify-login wrong TOTP -> 401 (+ no session)
  r = await req('POST', '/api/v1/site/2fa/verify-login', { body: { adminId, token: '000000', challengeToken: challengeA } });
  check('S4 wrong TOTP -> 401', r.status === 401, `status=${r.status}`);
  check('S4 no session cookie after wrong TOTP', !jar.has('site_access'));

  // S5 verify-login correct TOTP -> 200 + cookies
  r = await req('POST', '/api/v1/site/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const challengeB = r.json.data.challengeToken;
  let okVerify = false;
  for (const step of [0, -1, 1]) {
    r = await req('POST', '/api/v1/site/2fa/verify-login', { body: { adminId, token: totp(secret, step), challengeToken: challengeB } });
    if (r.status === 200) { okVerify = true; break; }
  }
  check('S5 verify-login correct TOTP -> 200 + session cookies', okVerify && jar.has('site_access') && jar.has('site_refresh') && jar.has('_csrf'), `status=${r.status}`);
  check('S5 session carries 2FA-verified + CSRF cookies', jar.has('site_access') && jar.has('_csrf'));

  // S6 /me
  r = await req('GET', '/api/v1/site/auth/me');
  check('S6 authenticated GET /me -> user matches', r.status === 200 && r.json?.data?.user?.email === EMAIL, `status=${r.status}`);
  check('S6 /me leaks no secrets', !/password|twoFactorSecret|backup/i.test(JSON.stringify(r.json)));

  // S7 CSRF negative: unsafe + session cookie + no Origin + no token -> 403
  r = await req('POST', '/api/v1/site/tenants', { body: {}, noToken: true });
  check('S7 no Origin + no CSRF token on POST -> 403', r.status === 403, `status=${r.status}`);

  // S8 health
  r = await req('GET', '/api/v1/site/health');
  check(
    'S8 health -> mongodb connected',
    r.status === 200 && r.json?.data?.mongodb?.status === 'connected',
    `status=${r.status} mongodb=${JSON.stringify(r.json?.data?.mongodb)}`,
  );

  // S9 analytics stats
  r = await req('GET', '/api/v1/site/analytics/stats');
  const stats = r.json?.data || {};
  const numericKeys = Object.keys(stats).filter((k) => typeof stats[k] === 'number');
  check('S9 analytics stats -> 200 with numeric aggregates', r.status === 200 && numericKeys.length >= 3, `status=${r.status} keys=${numericKeys.join(',')}`);

  // S10 analytics growth -> named series of {month,count} points
  r = await req('GET', '/api/v1/site/analytics/growth');
  const growthObj = r.json?.data || {};
  const series = ['tenants', 'patients', 'revenue'].filter((k) => Array.isArray(growthObj[k]));
  const growthOk =
    series.length >= 1 &&
    series.every((k) => growthObj[k].length > 0 && growthObj[k].every((p) => 'count' in p && 'month' in p));
  check('S10 analytics growth -> series of {month,count}', r.status === 200 && growthOk, `status=${r.status} series=${series.join(',')} months=${series.length ? growthObj[series[0]].length : 0}`);

  // S11 plans
  r = await req('GET', '/api/v1/site/plans');
  const plansBody = r.json?.data;
  const plans = Array.isArray(plansBody) ? plansBody : Array.isArray(plansBody?.plans) ? plansBody.plans : null;
  check('S11 plans -> array', r.status === 200 && Array.isArray(plans) && plans.length > 0, `status=${r.status} count=${Array.isArray(plans) ? plans.length : '?'}`);
  const firstPlanId = plans?.[0]?._id;

  // S12 list tenants
  r = await req('GET', '/api/v1/site/tenants');
  const tenantsList = r.json?.data?.tenants ?? r.json?.data;
  check('S12 GET /tenants -> list', r.status === 200 && Array.isArray(tenantsList), `status=${r.status} count=${Array.isArray(tenantsList) ? tenantsList.length : '?'}`);

  // S12b cleanup: drop any prior E2E test tenant (super + 2FA gated delete)
  const priorE2E = Array.isArray(tenantsList) ? tenantsList.find((t) => t.name === 'E2E Test Clinic') : null;
  if (priorE2E) {
    r = await req('DELETE', `/api/v1/site/tenants/${priorE2E._id}`);
    check('S12b cleanup: delete prior E2E tenant -> 200', r.status === 200, `status=${r.status}`);
  }

  // S13 list subscriptions
  r = await req('GET', '/api/v1/site/subscriptions');
  const subs = r.json?.data?.subscriptions ?? r.json?.data;
  check('S13 GET /subscriptions -> list', r.status === 200 && Array.isArray(subs), `status=${r.status} count=${Array.isArray(subs) ? subs.length : '?'}`);

  // S14 create tenant (2FA-gated) — the createTenant regression path
  createdTenantEmail = `e2e-clinic-${runTs}@dental.local`;
  r = await req('POST', '/api/v1/site/tenants', {
    body: {
      name: 'E2E Test Clinic',
      email: createdTenantEmail,
      phone: '+20 000 000 0000',
      address: '1 Test St',
      city: 'Cairo',
      country: 'EG',
      status: 'trial',
      adminPassword: 'E2ePassw0rd!',
    },
  });
  createdTenantId = r.json?.data?.tenant?._id ?? r.json?.data?._id;
  check('S14 create tenant -> 201 + tenant id', r.status === 201 && !!createdTenantId, `status=${r.status} id=${createdTenantId}`);
  check(
    'S14 NO adminPassword/adminCredentials leaked in create response',
    !/adminpassword|admincredentials|E2epassw0rd!/i.test(JSON.stringify(r.json)),
  );

  // S15 update tenant (2FA-gated) with frontend contract fields (update requires name)
  r = await req('PUT', `/api/v1/site/tenants/${createdTenantId}`, {
    body: { name: 'E2E Test Clinic', email: createdTenantEmail, phone: '+20 111 111 1111', city: 'Giza' },
  });
  check('S15 update tenant -> 200 w/ updated fields', r.status === 200 && r.json?.data?.tenant?.phone === '+20 111 111 1111', `status=${r.status} body=${JSON.stringify(r.json)?.slice(0, 140)}`);

  // S16 get tenant
  r = await req('GET', `/api/v1/site/tenants/${createdTenantId}`);
  check('S16 GET tenant by id', r.status === 200, `status=${r.status}`);

  // S17 find created tenant's subscription (payment amount must match subscription price)
  r = await req('GET', '/api/v1/site/subscriptions');
  const subsAfter = r.json?.data?.subscriptions ?? r.json?.data;
  const createdSub = (Array.isArray(subsAfter) && subsAfter.find((s) => String(s.tenant?._id ?? s.tenant ?? '') === String(createdTenantId))) || null;
  check('S17a created tenant has a subscription', !!createdSub, createdSub ? `amount=${createdSub.amount} status=${createdSub.status}` : 'no sub found');
  const subAmount = createdSub?.amount ?? 99;

  // S17b record payment with paymentMethod (frontend regression: was `method`)
  r = await req('POST', `/api/v1/site/subscriptions/${createdTenantId}/payment`, { body: { amount: subAmount, paymentMethod: 'cash' } });
  check('S17b record payment with paymentMethod -> 201', r.status === 201, `status=${r.status} body=${JSON.stringify(r.json)?.slice(0, 120)}`);

  // S18 update subscription (frontend contract {plan,status})
  if (createdSub) {
    r = await req('PUT', `/api/v1/site/subscriptions/${createdSub._id}`, { body: { status: createdSub.status } });
    check('S18 update subscription (status) -> 200', r.status === 200 && !!r.json?.data?._id, `status=${r.status} sub=${createdSub._id}`);
  } else {
    check('S18 update subscription -> 200', false, 'no subscription found for the created tenant');
  }

  // S19 refresh + rotation
  const oldRefresh = jar.get('site_refresh');
  r = await req('POST', '/api/v1/site/auth/refresh');
  const newRefresh = jar.get('site_refresh');
  check('S19 refresh -> 200 + rotated refresh cookie', r.status === 200 && !!newRefresh && newRefresh !== oldRefresh, `status=${r.status}`);

  // S20 replay old refresh token -> 401 (rotation + replay protection)
  const beforeReplay = jarSnapshot();
  r = await req('POST', '/api/v1/site/auth/refresh', {
    noToken: true,
    extraHeaders: { Cookie: `site_refresh=${oldRefresh}; _csrf=${beforeReplay.get('_csrf')}`, 'X-CSRF-Token': beforeReplay.get('_csrf') },
  });
  check('S20 replay of rotated refresh token -> 401', r.status === 401, `status=${r.status}`);
  jarRestore(beforeReplay);

  // S21 create temp admin (super + 2FA gated)
  const tempEmail = `e2e-admin-${runTs}@dental.local`;
  r = await req('POST', '/api/v1/site/admins', { body: { name: 'E2E Temp Admin', email: tempEmail, password: 'E2ePassw0rd!', role: 'admin' } });
  const tempAdminId = r.json?.data?.admin?._id ?? r.json?.data?._id;
  check('S21 create admin (super+2FA) -> 201', r.status === 201 && !!tempAdminId, `status=${r.status}`);
  const superJarSnap = jarSnapshot();

  // S22 login WITHOUT 2FA as the admin-role account -> direct cookies, no challenge
  r = await req('POST', '/api/v1/site/auth/login', { body: { email: tempEmail, password: 'E2ePassw0rd!' } });
  check('S22 non-super login without 2FA -> 200 + user', r.status === 200 && !!r.json?.data?.user, `status=${r.status}`);
  check('S22 login skipped the 2FA challenge', !r.json?.data?.requires2fa, `requires2fa=${r.json?.data?.requires2fa}`);
  r = await req('GET', '/api/v1/site/auth/me');
  check('S22 temp admin /me works', r.status === 200 && r.json?.data?.user?.email === tempEmail, `status=${r.status}`);

  // S23 require2fa must BLOCK a non-2FA session on a sensitive op
  r = await req('POST', `/api/v1/site/subscriptions/${createdTenantId}/payment`, { body: { amount: 10, paymentMethod: 'cash' } });
  check('S23 require2fa blocks sensitive op without 2FA-verified session -> 403', r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)?.slice(0, 120)}`);

  // S24 temp admin logout
  r = await req('POST', '/api/v1/site/auth/logout');
  check('S24 temp admin logout -> 200', r.status === 200, `status=${r.status}`);

  // restore super session and delete temp admin
  jarRestore(superJarSnap);
  r = await req('DELETE', `/api/v1/site/admins/${tempAdminId}`);
  check('S25 delete temp admin (super+2FA) -> 200', r.status === 200, `status=${r.status}`);

  // S26 logout super -> protected GET -> 401
  r = await req('POST', '/api/v1/site/auth/logout');
  check('S26 logout -> 200', r.status === 200, `status=${r.status}`);
  r = await req('GET', '/api/v1/site/tenants');
  check('S26 protected GET after logout -> 401', r.status === 401, `status=${r.status}`);
} catch (err) {
  console.log(`\nE2E ABORTED: ${err.message}\n${err.stack?.split('\n').slice(0, 4).join('\n')}`);
  results.push({ name: 'run completed', ok: false, detail: err.message });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}

summarize();
console.log(`\nCreated tenant (left in place for UI verification): ${createdTenantEmail} / id=${createdTenantId}`);