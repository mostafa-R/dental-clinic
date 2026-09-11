import cron from 'node-cron';

import { withCronLock } from './cronLock.js';
import { scanAndNotifyQueuePositions } from './queueNotificationService.js';

// Live queue moves quickly: 2-minute ticks keep position updates and the
// near-turn alert timely without hammering the database.
const CHECK_INTERVAL = '*/2 * * * *';
const CRON_LOCK_KEY = 'queue_notify_cron';
// Comfortably under the 2-minute interval so a long pass never blocks the
// next tick (mirrors the other cron locks).
const CRON_LOCK_TTL_MS = 60 * 1000;

async function runQueueNotify() {
  return withCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_MS, scanAndNotifyQueuePositions);
}

let task = null;

export function startQueueNotifyCron() {
  task = cron.schedule(CHECK_INTERVAL, runQueueNotify);
  console.log('[QueueNotify] Cron scheduled every 2 minutes');
}

export function stopQueueNotifyCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[QueueNotify] Cron stopped');
  }
}