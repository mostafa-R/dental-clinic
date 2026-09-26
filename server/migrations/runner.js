import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import Migration from './migration.model.js';
import { logger } from '../utils/logger.js';
import { connectDB } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Every migration reads from `mongoose.connection.db` and the runner records
 * applied versions through the `Migration` model, so a live connection is a
 * hard requirement — without it the first query just buffers until it times
 * out with `buffering timed out after 10000ms`.
 *
 * `server.js` already calls `connectDB()` before `runMigrations()`, so this is
 * a no-op on the normal boot path. It exists for the standalone CLI entry
 * (`npm run migrate`), which used to import the runner directly and therefore
 * ran every migration with no connection at all.
 */
async function ensureConnected() {
  // On the server boot path `app.js` has already loaded .env as an import side
  // effect. The CLI imports only this file, so without this `MONGO_URI` is
  // undefined and connectDB() would exit(1) with "MONGO_URI is not defined".
  // dotenv never overrides a variable that is already set, so an exported
  // MONGO_URI still wins.
  dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState === 1) return;
  await connectDB();
}

/**
 * Get all migration files sorted by version (filename prefix).
 * Migration files should be named: 001-name.js, 002-name.js, etc.
 */
async function getMigrationFiles() {
  const files = await readdir(__dirname);
  return files
    .filter((f) => f.endsWith('.js') && f !== 'migration.model.js' && f !== 'runner.js' && /^\d{3}-/.test(f))
    .sort()
    .map((f) => ({
      version: f.split('-')[0],
      name: f.replace('.js', ''),
      filename: f,
    }));
}

/**
 * Get versions already applied.
 */
async function getAppliedVersions() {
  const applied = await Migration.find({}).select('version').lean();
  return new Set(applied.map((m) => m.version));
}

/**
 * Run all pending migrations.
 */
export async function runMigrations() {
  await ensureConnected();

  const files = await getMigrationFiles();
  const applied = await getAppliedVersions();
  const pending = files.filter((f) => !applied.has(f.version));

  if (pending.length === 0) {
    logger.info('[Migrations] No pending migrations');
    return { applied: 0, total: files.length };
  }

  logger.info(`[Migrations] Found ${pending.length} pending migration(s)`);

  let count = 0;
  for (const migration of pending) {
    const start = Date.now();
    try {
      const mod = await import(pathToFileURL(path.join(__dirname, migration.filename)).href);
      if (typeof mod.up === 'function') {
        await mod.up();
      }
      const duration = Date.now() - start;
      await Migration.create({
        version: migration.version,
        name: migration.name,
        durationMs: duration,
      });
      logger.info(`[Migrations] Applied ${migration.name} in ${duration}ms`);
      count++;
    } catch (err) {
      logger.error({ err }, `[Migrations] Failed to apply ${migration.name}: ${err.message}`);
      throw err;
    }
  }

  logger.info(`[Migrations] Applied ${count} migration(s)`);
  return { applied: count, total: files.length };
}
