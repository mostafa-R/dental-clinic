import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

/**
 * Regression coverage for branch scoping of the Live Queue sockets.
 *
 * The bug: `subscribe:branch` verified only that the branch belonged to the
 * caller's TENANT, and `subscribe:queue` joined the tenant-wide queue room
 * unconditionally. Both rooms are broadcast rooms carrying patient names/ids,
 * so a branch-scoped receptionist could subscribe to a sibling branch and read
 * that branch's patients in real time — a horizontal PHI breach between
 * branches of the same clinic.
 *
 * The fix routes branch-scoped staff to a per-branch queue room
 * (`queue:{tenant}:{branch}`) and rejects cross-branch subscriptions, while
 * clinic-wide staff keep the tenant-wide board.
 *
 * These drive a real Socket.IO server so the room-join behaviour itself is
 * under test, not just a mocked `join` call.
 */

const findById = vi.fn();
const roleFindOne = vi.fn();
const branchFindOne = vi.fn();
const tenantFindById = vi.fn();
const siteAdminFindById = vi.fn();

const oid = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

function query(result) {
  const q = {
    populate: vi.fn(() => q),
    lean: vi.fn(() => q),
    select: vi.fn(() => q),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return q;
}

vi.mock('../modules/users/user.model.js', () => ({
  default: { findById: (...a) => findById(...a) },
}));
vi.mock('../modules/users/role.model.js', () => ({
  default: { findOne: (...a) => roleFindOne(...a) },
}));
vi.mock('../modules/users/branch.model.js', () => ({
  default: { findOne: (...a) => branchFindOne(...a) },
}));
vi.mock('../modules/site/tenant/tenant.model.js', () => ({
  default: { findById: (...a) => tenantFindById(...a) },
}));
vi.mock('../modules/site/admin/admin.model.js', () => ({
  default: { findById: (...a) => siteAdminFindById(...a) },
}));

const { initSocket, getIO, emitToTenantQueue } = await import('../socket/index.js');

const TENANT = oid(1);
const BRANCH_A = oid(2);
const BRANCH_B = oid(3);

// The socket middleware verifies with `secrets().access`, so the test must sign
// with the same key the module under test reads.
const SOCKET_JWT_SECRET =
  process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'socket-test-secret';

let httpServer;
let port;
const clients = [];

const BRANCH_ROLE = { _id: oid(10), isSystemAdmin: false, permissions: [{ module: 'appointments', actions: ['read'] }] };
const CLINIC_WIDE_ROLE = { _id: oid(11), isSystemAdmin: false, permissions: [{ module: 'branches', actions: ['read', 'update'] }] };

/**
 * A populated `tenant` document: carries plan/status fields AND stringifies to
 * its id, which is what the socket middleware relies on
 * (`user.tenant.toString()`). A bare object would stringify to "[object Object]"
 * and produce a nonsense room name.
 */
function populatedTenant() {
  return {
    _id: TENANT,
    plan: 'pro',
    planModules: null,
    subscriptionEndsAt: null,
    trialEndsAt: null,
    status: 'active',
    isActive: true,
    toString: () => String(TENANT),
  };
}

function makeUser({ branch, role, id = oid(20) }) {
  return {
    _id: id,
    name: 'Test User',
    isActive: true,
    tokenVersion: 0,
    roleId: role._id,
    // `branch` is populated too, and the middleware calls `.toString()` on it.
    branch: branch ? { _id: branch, name: 'Branch', toString: () => String(branch) } : null,
    tenant: populatedTenant(),
  };
}

async function connect({ user, role }) {
  const token = jwt.sign({ sub: user._id, tokenVersion: 0 }, SOCKET_JWT_SECRET, { expiresIn: '10m' });
  findById.mockReturnValue(query(user));
  roleFindOne.mockReturnValue(query(role));
  branchFindOne.mockImplementation((filter) =>
    query(filter.tenant ? { _id: filter._id } : null),
  );
  tenantFindById.mockReturnValue(query(user.tenant));

  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  clients.push(socket);
  socket.testToken = token;
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return socket;
}

async function roomsForClient(token) {
  const io = getIO();
  await new Promise((r) => setTimeout(r, 60));
  for (const s of io.sockets.sockets.values()) {
    // Match by the auth token the client used to connect.
    if (s.handshake.auth?.token === token) {
      return [...s.rooms];
    }
  }
  return [];
}

beforeEach(async () => {
  httpServer = createServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  port = httpServer.address().port;
  initSocket(httpServer);
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  getIO().close();
  await new Promise((r) => httpServer.close(r));
  vi.clearAllMocks();
});

describe('Live Queue branch scoping', () => {
  it('rejects a branch-scoped user subscribing to another branch', async () => {
    const user = makeUser({ branch: BRANCH_A, role: BRANCH_ROLE });
    const socket = await connect({ user, role: BRANCH_ROLE });

    const error = await new Promise((resolve) => {
      socket.on('error', resolve);
      socket.emit('subscribe:branch', BRANCH_B);
    });

    expect(error).toBeTruthy();
    expect(String(error.message)).toMatch(/not authorized/i);
    const rooms = await roomsForClient(socket.testToken);
    expect(rooms).not.toContain(`branch:${BRANCH_B}`);
  });

  it('lets a branch-scoped user subscribe to their OWN branch', async () => {
    const user = makeUser({ branch: BRANCH_A, role: BRANCH_ROLE });
    const socket = await connect({ user, role: BRANCH_ROLE });

    socket.emit('subscribe:branch', BRANCH_A);
    const rooms = await roomsForClient(socket.testToken);

    expect(rooms).toContain(`branch:${BRANCH_A}`);
  });

  it('keeps a branch-scoped user OUT of the clinic-wide queue room', async () => {
    const user = makeUser({ branch: BRANCH_A, role: BRANCH_ROLE });
    const socket = await connect({ user, role: BRANCH_ROLE });

    socket.emit('subscribe:queue');
    const rooms = await roomsForClient(socket.testToken);

    // The tenant-wide room carries every branch's patients — must not be joined.
    expect(rooms).not.toContain(`queue:${TENANT}`);
    expect(rooms).toContain(`queue:${TENANT}:${BRANCH_A}`);
  });

  it('gives a clinic-wide user the tenant-wide queue room', async () => {
    const user = makeUser({ branch: BRANCH_A, role: CLINIC_WIDE_ROLE });
    const socket = await connect({ user, role: CLINIC_WIDE_ROLE });

    socket.emit('subscribe:queue');
    const rooms = await roomsForClient(socket.testToken);

    expect(rooms).toContain(`queue:${TENANT}`);
  });

  it('does not deliver one branch\'s queue event to another branch\'s staff', async () => {
    const userA = makeUser({ branch: BRANCH_A, role: BRANCH_ROLE, id: oid(21) });
    const socketA = await connect({ user: userA, role: BRANCH_ROLE });
    socketA.emit('subscribe:queue');
    await roomsForClient(socketA);

    const receivedByA = [];
    socketA.on('queue.patient.called', (p) => receivedByA.push(p));

    // An event for branch B must not reach a branch-A-only subscriber.
    emitToTenantQueue(String(TENANT), 'queue.patient.called', { appointment: { branch: BRANCH_B } }, String(BRANCH_B));
    await new Promise((r) => setTimeout(r, 120));

    // Branch A staff get nothing about branch B.
    expect(receivedByA).toHaveLength(0);
  });

  it('delivers a branch\'s own queue event to that branch\'s staff', async () => {
    const userA = makeUser({ branch: BRANCH_A, role: BRANCH_ROLE, id: oid(22) });
    const socketA = await connect({ user: userA, role: BRANCH_ROLE });
    socketA.emit('subscribe:queue');
    await roomsForClient(socketA);

    const received = [];
    socketA.on('queue.patient.called', (p) => received.push(p));

    emitToTenantQueue(String(TENANT), 'queue.patient.called', { appointment: { branch: BRANCH_A } }, String(BRANCH_A));
    await new Promise((r) => setTimeout(r, 120));

    expect(received).toHaveLength(1);
    expect(received[0].appointment.branch).toBe(BRANCH_A);
  });

  it('still delivers a queue event to clinic-wide subscribers exactly once', async () => {
    const user = makeUser({ branch: BRANCH_A, role: CLINIC_WIDE_ROLE, id: oid(23) });
    const socket = await connect({ user, role: CLINIC_WIDE_ROLE });
    socket.emit('subscribe:queue');
    await roomsForClient(socket.testToken);

    const received = [];
    socket.on('queue.patient.called', (p) => received.push(p));

    emitToTenantQueue(String(TENANT), 'queue.patient.called', { appointment: { branch: BRANCH_A } }, String(BRANCH_A));
    await new Promise((r) => setTimeout(r, 120));

    // Once — not doubled by the per-branch room fan-out.
    expect(received).toHaveLength(1);
  });

  it('leaves both queue rooms on unsubscribe', async () => {
    const user = makeUser({ branch: BRANCH_A, role: CLINIC_WIDE_ROLE, id: oid(24) });
    const socket = await connect({ user, role: CLINIC_WIDE_ROLE });
    socket.emit('subscribe:queue');
    await roomsForClient(socket.testToken);

    socket.emit('unsubscribe:queue');
    const rooms = await roomsForClient(socket.testToken);

    expect(rooms).not.toContain(`queue:${TENANT}`);
    expect(rooms).not.toContain(`queue:${TENANT}:${BRANCH_A}`);
  });
});
