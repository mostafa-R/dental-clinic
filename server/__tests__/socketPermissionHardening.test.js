import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

/**
 * Phase 1.2 socket permission hardening.
 * - Unknown events must not bypass authorization on PHI-capable emitters.
 * - Every emitted PHI-capable event must have an explicit authorization policy.
 * - Sensitive delivery remains permission- and tenant/branch-scoped.
 * - System-admin and impersonation behavior preserved.
 */

const findById = vi.fn();
const roleFindOne = vi.fn();
const branchFindOne = vi.fn();
const tenantFindById = vi.fn();
const siteAdminFindById = vi.fn();

const oid = (n) => `507f1f77bcf86cd7994391${String(n).padStart(2, '0')}`;

function query(result) {
  const q = {
    populate: vi.fn(() => q),
    lean: vi.fn(() => q),
    select: vi.fn(() => q),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return q;
}

vi.mock('../modules/users/user.model.js', () => ({ default: { findById: (...a) => findById(...a) } }));
vi.mock('../modules/users/role.model.js', () => ({ default: { findOne: (...a) => roleFindOne(...a) } }));
vi.mock('../modules/users/branch.model.js', () => ({ default: { findOne: (...a) => branchFindOne(...a) } }));
vi.mock('../modules/site/tenant/tenant.model.js', () => ({ default: { findById: (...a) => tenantFindById(...a) } }));
vi.mock('../modules/site/admin/admin.model.js', () => ({ default: { findById: (...a) => siteAdminFindById(...a) } }));

const {
  initSocket,
  getIO,
  emitToBranch,
  emitToTenantQueue,
  emitToChat,
  PHI_CAPABLE_EVENT_PERMISSION_REQUIREMENTS,
  PHI_CAPABLE_NON_SENSITIVE_ALLOWLIST,
} = await import('../socket/index.js');

const SOCKET_JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'socket-test-secret';
const TENANT_A = oid(1);
const BRANCH_A1 = oid(2);

const ROLE_PATIENTS_READ = { _id: oid(10), isSystemAdmin: false, permissions: [{ module: 'patients', actions: ['read'] }] };
const ROLE_NO_PHI = { _id: oid(11), isSystemAdmin: false, permissions: [{ module: 'branches', actions: ['read'] }] };
const ROLE_BILLING_READ = { _id: oid(12), isSystemAdmin: false, permissions: [{ module: 'billing', actions: ['read'] }] };
const ROLE_WALLET_READ = { _id: oid(13), isSystemAdmin: false, permissions: [{ module: 'wallet', actions: ['read'] }] };
const ROLE_SETTINGS_READ = { _id: oid(14), isSystemAdmin: false, permissions: [{ module: 'settings', actions: ['read'] }] };
const ROLE_USERS_READ = { _id: oid(15), isSystemAdmin: false, permissions: [{ module: 'users', actions: ['read'] }] };
const ROLE_CHAT_READ = { _id: oid(16), isSystemAdmin: false, permissions: [{ module: 'chat', actions: ['read'] }] };
const ROLE_SYSTEM_ADMIN = { _id: oid(17), isSystemAdmin: true, permissions: [] };

let httpServer;
let port;
const clients = [];

function populatedTenant(id = TENANT_A, extra = {}) {
  return {
    _id: id,
    plan: 'pro',
    planModules: null,
    subscriptionEndsAt: null,
    trialEndsAt: null,
    status: 'active',
    isActive: true,
    toString: () => String(id),
    ...extra,
  };
}

function makeUser({ id, branch = BRANCH_A1, tenant = TENANT_A, role, tenantDoc }) {
  return {
    _id: id,
    name: 'Test User',
    isActive: true,
    tokenVersion: 0,
    roleId: role._id,
    branch: branch ? { _id: branch, name: 'Branch', toString: () => String(branch) } : null,
    tenant: tenantDoc || populatedTenant(tenant),
  };
}

async function connect({ user, role, tokenType = 'clinic', tokenExtra = {} }) {
  const token = jwt.sign(
    { sub: user._id, tokenVersion: 0, type: tokenType, ...tokenExtra },
    SOCKET_JWT_SECRET,
    { expiresIn: '10m' },
  );
  findById.mockReturnValue(query(user));
  roleFindOne.mockReturnValue(query(role));
  branchFindOne.mockImplementation((filter) => query({ _id: filter._id, tenant: filter.tenant }));
  tenantFindById.mockReturnValue(query(user.tenant));

  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  clients.push(socket);
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return socket;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walkJsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (p.includes(`${path.sep}node_modules${path.sep}`) || p.includes(`${path.sep}coverage${path.sep}`)) continue;
    if (e.isDirectory()) walkJsFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

beforeEach(async () => {
  httpServer = createServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  port = httpServer.address().port;
  initSocket(httpServer);
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  try { getIO().close(); } catch {}
  await new Promise((r) => httpServer.close(r));
  vi.clearAllMocks();
});

describe('Socket permission hardening (Phase 1.2)', () => {
  it('blocks unknown events on PHI-capable emitters (emitToBranch) even for authorized sockets', async () => {
    const socket = await connect({
      user: makeUser({ id: oid(30), branch: BRANCH_A1, role: ROLE_PATIENTS_READ }),
      role: ROLE_PATIENTS_READ,
    });
    const received = [];
    socket.on('sensitive:unknown', (p) => received.push(p));
    await sleep(40);

    emitToBranch(String(BRANCH_A1), 'sensitive:unknown', { patient: { name: 'Leak' } });
    await sleep(120);

    expect(received).toHaveLength(0);
  });

  it('blocks unknown events on PHI-capable queue delivery (emitToTenantQueue)', async () => {
    const socket = await connect({
      user: makeUser({ id: oid(31), branch: BRANCH_A1, role: ROLE_BILLING_READ }),
      role: ROLE_BILLING_READ,
    });
    const received = [];
    socket.on('queue.unknown', (p) => received.push(p));
    await sleep(40);

    emitToTenantQueue(String(TENANT_A), 'queue.unknown', { appointment: { branch: BRANCH_A1 } }, String(BRANCH_A1));
    await sleep(120);

    expect(received).toHaveLength(0);
  });

  it('blocks unknown events on PHI-capable chat delivery (emitToChat)', async () => {
    const tenantWithChat = populatedTenant(TENANT_A, { planModules: ['chat'] });
    const socket = await connect({
      user: makeUser({ id: oid(32), branch: BRANCH_A1, role: ROLE_CHAT_READ, tenantDoc: tenantWithChat }),
      role: ROLE_CHAT_READ,
    });
    const received = [];
    socket.on('chat:unknown', (p) => received.push(p));
    await sleep(40);

    emitToChat({
      channel: 'general',
      tenantId: String(TENANT_A),
      senderId: String(oid(32)),
      event: 'chat:unknown',
      payload: { text: 'secret' },
    });
    await sleep(120);

    expect(received).toHaveLength(0);
  });

  it('enforces least-privilege finance mappings (wallet/installment: billing/wallet authorized, patients-only unauthorized)', async () => {
    const billing = await connect({
      user: makeUser({ id: oid(33), branch: BRANCH_A1, role: ROLE_BILLING_READ }),
      role: ROLE_BILLING_READ,
    });
    const wallet = await connect({
      user: makeUser({ id: oid(34), branch: BRANCH_A1, role: ROLE_WALLET_READ }),
      role: ROLE_WALLET_READ,
    });
    const patientsOnly = await connect({
      user: makeUser({ id: oid(35), branch: BRANCH_A1, role: ROLE_PATIENTS_READ }),
      role: ROLE_PATIENTS_READ,
    });

    const gotBilling = [];
    const gotWallet = [];
    const gotPatients = [];
    billing.on('wallet:updated', (p) => gotBilling.push(p));
    wallet.on('installment:paid', (p) => gotWallet.push(p));
    patientsOnly.on('wallet:updated', (p) => gotPatients.push(p));
    await sleep(40);

    emitToBranch(String(BRANCH_A1), 'wallet:updated', { wallet: { balance: 10 } });
    emitToBranch(String(BRANCH_A1), 'installment:paid', { installmentPlanId: 'x' });
    await sleep(120);

    expect(gotBilling).toHaveLength(1);
    expect(gotWallet).toHaveLength(1);
    expect(gotPatients).toHaveLength(0);
  });

  it('enforces least-privilege automation notify mapping (settings authorized, users-only unauthorized)', async () => {
    const settings = await connect({
      user: makeUser({ id: oid(36), branch: BRANCH_A1, role: ROLE_SETTINGS_READ }),
      role: ROLE_SETTINGS_READ,
    });
    const usersOnly = await connect({
      user: makeUser({ id: oid(37), branch: BRANCH_A1, role: ROLE_USERS_READ }),
      role: ROLE_USERS_READ,
    });
    const gotSettings = [];
    const gotUsers = [];
    settings.on('automation:notify', (p) => gotSettings.push(p));
    usersOnly.on('automation:notify', (p) => gotUsers.push(p));
    await sleep(40);

    emitToBranch(String(BRANCH_A1), 'automation:notify', { message: 'notify' });
    await sleep(120);

    expect(gotSettings).toHaveLength(1);
    expect(gotUsers).toHaveLength(0);
  });

  it('preserves system-admin and impersonation behavior for authorized sensitive delivery', async () => {
    const tenantWithChat = populatedTenant(TENANT_A, { planModules: ['chat'] });

    // System admin receives mapped sensitive events without explicit module grants
    const sys = await connect({
      user: makeUser({ id: oid(38), branch: BRANCH_A1, role: ROLE_SYSTEM_ADMIN }),
      role: ROLE_SYSTEM_ADMIN,
    });
    // Impersonated clinic socket still receives branch events but payload is PHI-stripped
    const impersonated = await connect({
      user: makeUser({ id: oid(39), branch: BRANCH_A1, role: ROLE_PATIENTS_READ }),
      role: ROLE_PATIENTS_READ,
      tokenExtra: { impersonating: true, impersonatorId: oid(99), impersonationExpiresAt: Date.now() + 60_000 },
    });

    const gotSys = [];
    const gotImp = [];
    sys.on('patient:created', (p) => gotSys.push(p));
    impersonated.on('patient:created', (p) => gotImp.push(p));
    await sleep(40);

    emitToBranch(String(BRANCH_A1), 'patient:created', { patient: { firstName: 'Jane', phone: '123' } });
    await sleep(120);

    expect(gotSys).toHaveLength(1);
    expect(gotImp).toHaveLength(1);
    // Impersonation must keep PHI masking (stripPHI semantics): phone should not be exposed
    expect(gotImp[0]?.patient?.phone).toBeUndefined();
  });

  it('fails if a newly introduced PHI-capable emitted event has no explicit authorization policy (source-scan guard)', () => {
    const serverRoot = path.resolve(__dirname, '..');
    const files = walkJsFiles(serverRoot).filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));
    const emitted = new Set();
    const branchRe = /emitToBranch\s*\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;
    const queueRe = /emitToTenantQueue\s*\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;
    const chatObjRe = /emitToChat\s*\(\s*\{[\s\S]*?\bevent\s*:\s*['"]([^'"]+)['"]/g;

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = branchRe.exec(src))) emitted.add(m[1]);
      while ((m = queueRe.exec(src))) emitted.add(m[1]);
      while ((m = chatObjRe.exec(src))) emitted.add(m[1]);
    }

    const eventNames = [...emitted];
    const missing = eventNames.filter(
      (e) => !PHI_CAPABLE_EVENT_PERMISSION_REQUIREMENTS[e] && !PHI_CAPABLE_NON_SENSITIVE_ALLOWLIST.has(e),
    );

    expect(missing, `Unclassified PHI-capable emitted events: ${missing.join(', ')}`).toEqual([]);
    // Sanity: known sensitive events remain explicitly classified
    expect(PHI_CAPABLE_EVENT_PERMISSION_REQUIREMENTS['patient:created']).toBeTruthy();
    expect(PHI_CAPABLE_EVENT_PERMISSION_REQUIREMENTS['invoice:created']).toBeTruthy();
  });
});
