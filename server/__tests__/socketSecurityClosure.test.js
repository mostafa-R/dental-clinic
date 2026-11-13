import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

/**
 * Phase 1.1 security closure: socket authorization/inventory verification.
 * - Audits automatic room joins and PHI-capable emit paths (emitToBranch/emitToTenantQueue/emitToChat).
 * - Verifies tenant/branch isolation and permission-aware event delivery.
 * - Uses a real Socket.IO server (no emit/room mocks).
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

const { initSocket, getIO, emitToBranch, emitToTenantQueue, emitToChat } = await import('../socket/index.js');

const SOCKET_JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'socket-test-secret';
const TENANT_A = oid(1);
const TENANT_B = oid(9);
const BRANCH_A1 = oid(2);
const BRANCH_A2 = oid(3);
const BRANCH_B1 = oid(4);

const ROLE_PATIENTS_READ = { _id: oid(10), isSystemAdmin: false, permissions: [{ module: 'patients', actions: ['read'] }] };
const ROLE_NO_PHI = { _id: oid(11), isSystemAdmin: false, permissions: [{ module: 'branches', actions: ['read'] }] };
const ROLE_QUEUE_READ = { _id: oid(12), isSystemAdmin: false, permissions: [{ module: 'appointments', actions: ['read'] }] };
const ROLE_CHAT_READ = { _id: oid(13), isSystemAdmin: false, permissions: [{ module: 'chat', actions: ['read'] }] };
const ROLE_CLINIC_WIDE_PATIENTS = {
  _id: oid(14),
  isSystemAdmin: false,
  permissions: [
    { module: 'branches', actions: ['read', 'update'] },
    { module: 'patients', actions: ['read'] },
  ],
};

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
  branchFindOne.mockImplementation((filter) => {
    // Authoritative tenant/branch ownership: only return branch when it belongs to requested tenant.
    const branchTenant = {
      [String(BRANCH_A1)]: String(TENANT_A),
      [String(BRANCH_A2)]: String(TENANT_A),
      [String(BRANCH_B1)]: String(TENANT_B),
    }[String(filter._id)];
    if (branchTenant && String(filter.tenant) === branchTenant) {
      return query({ _id: filter._id, tenant: filter.tenant });
    }
    return query(null);
  });
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

describe('Socket security closure (Phase 1.1)', () => {
  it('blocks cross-tenant branch subscription even for clinic-wide users (tenant/branch isolation)', async () => {
    const user = makeUser({ id: oid(20), branch: BRANCH_A1, tenant: TENANT_A, role: ROLE_CLINIC_WIDE_PATIENTS });
    const socket = await connect({ user, role: ROLE_CLINIC_WIDE_PATIENTS });

    // BRANCH_B1 is not in TENANT_A; Branch.findOne({ _id, tenant }) returns null.
    // The handler must not join the foreign-tenant branch room (silent ignore is acceptable).
    socket.emit('subscribe:branch', BRANCH_B1);
    await sleep(120);

    const io = getIO();
    const serverSocket = [...io.sockets.sockets.values()][0];
    expect(serverSocket).toBeTruthy();
    expect([...serverSocket.rooms]).not.toContain(`branch:${BRANCH_B1}`);
  });

  it('delivers PHI branch events only to authorized sockets in the same branch (emitToBranch)', async () => {
    const authorized = await connect({
      user: makeUser({ id: oid(21), branch: BRANCH_A1, role: ROLE_PATIENTS_READ }),
      role: ROLE_PATIENTS_READ,
    });
    const unauthorized = await connect({
      user: makeUser({ id: oid(22), branch: BRANCH_A1, role: ROLE_NO_PHI }),
      role: ROLE_NO_PHI,
    });

    const gotAuthorized = [];
    const gotUnauthorized = [];
    authorized.on('patient:created', (p) => gotAuthorized.push(p));
    unauthorized.on('patient:created', (p) => gotUnauthorized.push(p));
    await sleep(40);

    emitToBranch(String(BRANCH_A1), 'patient:created', { patient: { firstName: 'Jane', phone: '123' } });
    await sleep(120);

    expect(gotAuthorized).toHaveLength(1);
    expect(gotUnauthorized).toHaveLength(0);
  });

  it('does not deliver tenant queue PHI events to unauthorized queue subscribers (emitToTenantQueue)', async () => {
    // Authorized clinic-wide queue reader
    const reader = await connect({
      user: makeUser({ id: oid(23), branch: BRANCH_A1, role: ROLE_QUEUE_READ, tenant: TENANT_A }),
      role: { ...ROLE_QUEUE_READ, permissions: [{ module: 'branches', actions: ['read', 'update'] }, { module: 'appointments', actions: ['read'] }] },
    });
    // Same tenant, different branch, lacks queue/appointments read and must not receive queue events.
    const noAccess = await connect({
      user: makeUser({ id: oid(24), branch: BRANCH_A2, role: ROLE_NO_PHI, tenant: TENANT_A }),
      role: ROLE_NO_PHI,
    });

    reader.emit('subscribe:queue');
    await sleep(60);

    const gotReader = [];
    const gotNoAccess = [];
    reader.on('queue.patient.called', (p) => gotReader.push(p));
    noAccess.on('queue.patient.called', (p) => gotNoAccess.push(p));

    emitToTenantQueue(String(TENANT_A), 'queue.patient.called', { appointment: { patient: { firstName: 'A' }, branch: BRANCH_A1 } }, String(BRANCH_A1));
    await sleep(120);

    expect(gotReader).toHaveLength(1);
    expect(gotNoAccess).toHaveLength(0);
  });

  it('does not deliver chat messages to sockets without chat permission in chat channel delivery path (emitToChat)', async () => {
    const tenantWithChat = populatedTenant(TENANT_A, { planModules: ['chat'] });
    const chatUser = await connect({
      user: makeUser({ id: oid(25), branch: BRANCH_A1, role: ROLE_CHAT_READ, tenant: TENANT_A, tenantDoc: tenantWithChat }),
      role: ROLE_CHAT_READ,
    });
    const noChat = await connect({
      user: makeUser({ id: oid(26), branch: BRANCH_A1, role: ROLE_NO_PHI, tenant: TENANT_A, tenantDoc: tenantWithChat }),
      role: ROLE_NO_PHI,
    });

    const gotChat = [];
    const gotNoChat = [];
    chatUser.on('chat:message', (p) => gotChat.push(p));
    noChat.on('chat:message', (p) => gotNoChat.push(p));
    await sleep(60);

    emitToChat({
      channel: 'general',
      tenantId: String(TENANT_A),
      senderId: String(oid(25)),
      event: 'chat:message',
      payload: { text: 'hello' },
    });
    await sleep(120);

    expect(gotChat).toHaveLength(1);
    expect(gotNoChat).toHaveLength(0);
  });
});
