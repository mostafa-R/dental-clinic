import mongoose from 'mongoose';
import { Server } from 'socket.io';

import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../utils/jwt.js';

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
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie;
    let raw = token;

    if (token && typeof token === 'string' && token.includes('access_token=')) {
      const match = token.match(/access_token=([^;]+)/);
      raw = match ? match[1] : token;
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
      .then((user) => {
        if (!user || !user.isActive) {
          return next(new Error('User no longer valid'));
        }
        socket.user = {
          _id: user._id.toString(),
          name: user.name,
          role: user.role,
          branch: user.branch ? user.branch._id.toString() : null,
          tenant: user.tenant ? user.tenant.toString() : null,
        };
        next();
      })
      .catch((err) => next(err));
  });

  io.on('connection', (socket) => {
    if (socket.user.role === 'site_admin') {
      socket.join(ADMIN_ROOM);
    }
    if (socket.user.branch) {
      socket.join(branchRoom(socket.user.branch));
    }

    socket.join(userRoom(socket.user._id));
    // Join tenant-scoped chat channels — each tenant has isolated rooms
    if (socket.user.tenant) {
      CHAT_CHANNELS.forEach((ch) => socket.join(chatChannelRoom(socket.user.tenant, ch)));
    }

    socket.on('subscribe:branch', async (branchId) => {
      try {
        if (socket.user.role === 'site_admin' && branchId) {
          const branch = await mongoose.model('Branch').findById(branchId).select('tenant').lean();
          if (branch) {
            const adminTenants = await Tenant.find({ siteAdmins: socket.user._id }).select('_id').lean();
            const isAuthorized = adminTenants.some((t) => t._id.toString() === String(branch.tenant));
            if (isAuthorized) {
              socket.join(branchRoom(branchId));
            }
          }
        }
      } catch (err) {
        console.error('[Socket] subscribe:branch error:', err);
        socket.emit('error', { message: 'Failed to subscribe to branch' });
      }
    });

    socket.on('unsubscribe:branch', (branchId) => {
      socket.leave(branchRoom(branchId));
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/**
 * Emit a real-time event to everyone who should see changes for a given branch:
 * users in that branch's room, plus any site_admin observing.
 */
export function emitToBranch(branchId, event, payload) {
  if (!io) return;
  const room = branchRoom(branchId);
  if (room) io.to(room).emit(event, payload);
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
    if (room) io.to(room).emit(event, payload);
  });
}

export { ADMIN_ROOM };
