/**
 * Global test setup for Dental Clinic Server tests
 * Improves test performance by mocking external dependencies and setting up test environment
 */

import { vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

// Global mocks for external dependencies
export function setup() {
  console.log('🔧 Setting up global test environment...');
  
  // Mock heavy dependencies
  vi.mock('../services/whatsapp.js', () => ({
    disconnectAllWhatsAppClients: vi.fn().mockResolvedValue(undefined),
    initializeWhatsAppClient: vi.fn().mockResolvedValue({ connected: true }),
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true })
  }));
  
  // Mock Redis
  vi.mock('../config/redis.js', () => ({
    connectRedis: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
    getRedis: vi.fn().mockReturnValue({
      call: vi.fn().mockResolvedValue(undefined),
      status: 'ready'
    }),
    getRedisInfo: vi.fn().mockResolvedValue({
      connected: true,
      usedMemory: '1MB',
      totalConnections: 0,
      uptime: 3600,
      cacheHits: 100,
      cacheMisses: 10,
      hitRate: 90
    })
  }));
  
  // Mock database migrations
  vi.mock('../migrations/runner.js', () => ({
    runMigrations: vi.fn().mockResolvedValue(undefined)
  }));
  
  // Mock cron jobs
  vi.mock('../services/suspensionCron.js', () => ({
    startSuspensionCron: vi.fn(),
    stopSuspensionCron: vi.fn()
  }));
  
  vi.mock('../services/abuseDetection.js', () => ({
    startAbuseCron: vi.fn(),
    stopAbuseCron: vi.fn(),
    stopAbuseFlusher: vi.fn(),
    trackRequest: vi.fn()
  }));
  
  vi.mock('../services/whatsappReminderCron.js', () => ({
    startWhatsAppReminderCron: vi.fn(),
    stopWhatsAppReminderCron: vi.fn()
  }));
  
  vi.mock('../services/backupCron.js', () => ({
    startBackupCron: vi.fn().mockResolvedValue(undefined),
    stopBackupCron: vi.fn()
  }));
  
  vi.mock('../services/installmentCron.js', () => ({
    startInstallmentCron: vi.fn(),
    stopInstallmentCron: vi.fn()
  }));
  
  vi.mock('../services/noShowCron.js', () => ({
    startNoShowCron: vi.fn(),
    stopNoShowCron: vi.fn()
  }));
  
  vi.mock('../services/inventoryCron.js', () => ({
    startInventoryCron: vi.fn(),
    stopInventoryCron: vi.fn()
  }));
  
  // Mock socket.io
  vi.mock('../socket/index.js', () => ({
    initSocket: vi.fn(),
    getIO: vi.fn().mockReturnValue({
      close: vi.fn()
    })
  }));
  
  console.log('✅ Global test setup complete');
}

export function teardown() {
  console.log('🧹 Cleaning up global test environment...');
  
  // Clear all mocks
  vi.clearAllMocks();
  
  console.log('✅ Global test teardown complete');
}