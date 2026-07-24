import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Migration from './migration.model.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/**
 * List migration status.
 */
export async function listMigrations() {
  const files = await getMigrationFiles();
  const applied = await getApplied();

  return files.map((f) => {
    const record = applied.find((a) => a.version === f.version);
    return {
      version: f.version,
      name: f.name,
      applied: !!record,
      appliedAt: record?.appliedAt || null,
      durationMs: record?.durationMs || null,
    };
  });
}

async function getApplied() {
  return Migration.find({}).sort('version').lean();
}
