import { Server } from 'socket.io';

import Branch from '../modules/users/branch.model.js';
import Role from '../modules/users/role.model.js';
import Tenant from '../modules/site/tenant/tenant.model.js';
import User from '../modules/users/user.model.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { planIncludesModule } from '../constants/plans.js';
import { stripPHI } from '../middleware/phiRestrict.js';

let io = null;

function branchRoom(branchId) {
  return branchId ? `branch:${String(branchId)}` : null;
}

function userRoom(userId) {
  return userId ? `user:${String(userId)}` : null;
}

function chatChannelRoom(tenantId, channel) {
  return channel ? `chat:${String(tenantId)}:${String(channel)}` : null;
}

const ADMIN_ROOM = 'admin';
const CHAT_CHANNELS = ['doctors', 'accounting', 'general'];

// Simple per-IP connection cap so a misbehaving client cannot hold the
// process hostage with an unbounded number of sockets.
const IP_CONNECTION_LIMIT = 20;
const connectionsByIp = new Map();

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL
        ? process.env.CLIENT_URL.split(',').map((url) => url.trim())
        : ['http://localhost:5173'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const ip = socket.handshake.address || 'unknown';
    if ((connectionsByIp.get(ip) || 0) >= IP_CONNECTION_LIMIT) {
      return next(new Error(`Too many concurrent connections from this IP`));
    }

    const token = socket.handshake.auth?.token;
    const cookie = socket.handshake.headers?.cookie;

    let raw = token;
    if (!raw && cookie && typeof cookie === 'string') {
      const match = cookie.match(/access_token=([^;]+)/);
      raw = match ? match[1] : null;
    }

    if (!raw) {
      return next(new Error('Unauthorized'));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(raw);
    } catch {
      return next(new Error('Invalid or expired token'));
    }

    User.findById(decoded.sub)
      .populate('branch', 'name')
      .then(async (user) => {
        if (!user || !user.isActive) {
          return next(new Error('User no longer valid'));
        }
        if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
          return next(new Error('Token revoked — please log in again'));
        }

        // Resolve system admin status from Role document
        let isSystemAdmin = false;
        if (user.roleId) {
          const roleDoc = await Role.findById(user.roleId).select('isSystemAdmin').lean();
          isSystemAdmin = !!roleDoc?.isSystemAdmin;
        }

        socket.user = {
          _id: user._id.toString(),
          name: user.name,
          branch: user.branch ? user.branch._id.toString() : null,
          tenant: user.tenant ? user.tenant.toString() : null,
          isSystemAdmin,
        };

        // Tag impersonated sessions so room membership below can restrict
        // them to branch data and never chat/DM rooms.
        if (decoded.type === 'impersonation') {
          socket.user.impersonating = true;
          socket.user.impersonator = decoded.impersonator || null;
        }

        // Enforce tenant subscription status (mirrors middleware/auth.js
        // protect): clinic users from suspended/cancelled/inactive tenants
        // cannot hold a live socket.
        if (user.tenant && !isSystemAdmin) {
          const tenant = await Tenant.findById(user.tenant)
            .select('status isActive plan planModules')
            .lean();
          if (
            !tenant ||
            !tenant.isActive ||
            tenant.status === 'suspended' ||
            tenant.status === 'cancelled' ||
            tenant.status === 'archived'
          ) {
            return next(new Error('Your clinic subscription is inactive'));
          }
          socket.user.tenantPlan = { plan: tenant.plan, planModules: tenant.planModules };
        }

        next();
      })
      .catch((err) => next(err));
  });

  io.on('connection', (socket) => {
    const ip = socket.handshake.address || 'unknown';
    connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1);
    socket.on('disconnect', () => {
      const n = connectionsByIp.get(ip) || 0;
      if (n <= 1) connectionsByIp.delete(ip);
      else connectionsByIp.set(ip, n - 1);
    });

    if (socket.user.impersonating) {
      // Impersonated sessions are read-only views into the target clinic:
      // they join the branch room so live data refreshes work, but they must
      // never join chat channel rooms or the impersonated user's personal
      // room (that would deliver that user's private DMs to the impersonator).
      if (socket.user.branch) {
        socket.join(branchRoom(socket.user.branch));
      }
    } else {
      if (socket.user.isSystemAdmin) {
        socket.join(ADMIN_ROOM);
      }
      if (socket.user.branch) {
        socket.join(branchRoom(socket.user.branch));
      }

      socket.join(userRoom(socket.user._id));
      // Join tenant-scoped chat channels — each tenant has isolated rooms and
      // the chat module must be included in the tenant's subscription plan.
      if (socket.user.tenant && !socket.user.isSystemAdmin && planIncludesModule(socket.user.tenantPlan, 'chat')) {
        CHAT_CHANNELS.forEach((ch) => socket.join(chatChannelRoom(socket.user.tenant, ch)));
      }
    }

    socket.on('subscribe:branch', async (branchId) => {
      try {
        if (!branchId) return;
        // System admins can subscribe to any branch.
        if (socket.user.isSystemAdmin) {
          socket.join(branchRoom(branchId));
          return;
        }
        // Clinic-level users can subscribe to branches in their own tenant.
        if (socket.user.tenant) {
          const branch = await Branch.findOne({ _id: branchId, tenant: socket.user.tenant }).select('_id').lean();
          if (branch) {
            socket.join(branchRoom(branchId));
          }
        }
      } catch (err) {
        console.error('[Socket] subscribe:branch error:', err);
        socket.emit('error', { message: 'Failed to subscribe to branch' });
      }
    });

    socket.on('unsubscribe:branch', (branchId) => {
      if (branchId && typeof branchId === 'string') {
        socket.leave(branchRoom(branchId));
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/**
 * Convert a Mongoose document to a plain object (so stripPHI's deep recursion
 * can walk nested populated docs) and remove PHI fields.
 */
function sanitize(payload) {
  const plain = payload && typeof payload.toJSON === 'function' ? payload.toJSON() : payload;
  return stripPHI(plain);
}

/**
 * Emit a real-time event to everyone who should see changes for a given branch:
 * users in that branch's room, plus any site_admin observing.
 *
 * The payload is stripped of PHI per socket: impersonated sessions (which join
 * the branch room) must not receive patient phone/email/notes over the wire,
 * while regular clinic users keep the full document.
 */
export function emitToBranch(branchId, event, payload) {
  if (!io) return;
  const room = branchRoom(branchId);
  if (!room) return;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (!roomSockets) return;
  for (const socketId of roomSockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const data = socket.user?.impersonating ? sanitize(payload) : payload;
    io.to(socketId).emit(event, data);
  }
}

/**
 * Emit a chat event to the relevant conversation room(s).
 * For DMs: emits to the sender's and recipient's personal rooms.
 * For channels: emits to the channel room.
 */
export function emitToChat({ recipient, channel, senderId, tenantId, event, payload }) {
  if (!io) return;
  const rooms = new Set();
  if (recipient) {
    if (senderId) rooms.add(userRoom(senderId));
    rooms.add(userRoom(recipient));
  } else if (channel) {
    // Channel messages must be scoped to a tenant to prevent cross-tenant leakage
    if (!tenantId) return;
    rooms.add(chatChannelRoom(tenantId, channel));
  }
  rooms.forEach((room) => {
    if (!room) return;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return;
    for (const socketId of roomSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      const data = socket.user?.impersonating ? sanitize(payload) : payload;
      io.to(socketId).emit(event, data);
    }
  });
}
