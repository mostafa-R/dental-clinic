// @vitest-environment node
/**
 * Tests for the route registry in `lib/routes.js`.
 *
 * The registry is what makes "the URLs" and "the sidebar" the same subject, so
 * the tests here are mostly about the two staying derivable from one list: the
 * sidebar renders `NAV_ITEMS`, and `ModuleGuard` resolves `location.pathname`
 * through `moduleForPath`. A route added to one but not the other would either
 * be invisible-but-reachable, or visible-but-bouncing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LANDING_PATH,
  NAV_ITEMS,
  NAV_ROUTES,
  NAV_SECTION_ORDER,
  moduleForPath,
  navRouteForModule,
} from './routes';
import { MODULE_KEYS } from '../features/roles/permissions';

const CLIENT_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(CLIENT_SRC, '..', '..');

describe('moduleForPath - URL to permission module', () => {
  it('maps every sidebar URL to its module', () => {
    expect(moduleForPath('/dashboard')).toBe('dashboard');
    expect(moduleForPath('/patients')).toBe('patients');
    expect(moduleForPath('/appointments')).toBe('appointments');
    expect(moduleForPath('/recalls')).toBe('appointments');
    expect(moduleForPath('/billing')).toBe('billing');
    expect(moduleForPath('/accounting')).toBe('accounting');
    expect(moduleForPath('/inventory')).toBe('inventory');
    expect(moduleForPath('/branches')).toBe('branches');
    expect(moduleForPath('/chat')).toBe('chat');
    expect(moduleForPath('/users')).toBe('users');
    expect(moduleForPath('/roles')).toBe('roles');
    expect(moduleForPath('/settings')).toBe('settings');
  });

  it('resolves the longest matching pattern for nested URLs', () => {
    // The EMR sits under a patient but is a different module. Without
    // longest-match, `/patients/123/emr` would be checked against `patients`
    // and a role with patients access but no emr access would slip through.
    expect(moduleForPath('/patients/65f0c1/emr')).toBe('emr');
    expect(moduleForPath('/patients/65f0c1')).toBe('patients');
  });

  it('does not treat a longer sibling path as a match', () => {
    // `/patients` must not swallow an unrelated top-level path that merely
    // starts with the same letters.
    expect(moduleForPath('/patient')).toBeNull();
    expect(moduleForPath('/settings-legacy')).toBeNull();
  });

  it('ignores query strings and trailing slashes', () => {
    expect(moduleForPath('/appointments?tab=queue')).toBe('appointments');
    expect(moduleForPath('/billing/')).toBe('billing');
  });

  it('returns null for unregistered paths so the 404 branch still renders', () => {
    expect(moduleForPath('/nope')).toBeNull();
    expect(moduleForPath('/')).toBeNull();
    expect(moduleForPath('')).toBeNull();
    expect(moduleForPath(undefined)).toBeNull();
  });

  it('does not let an unknown subpath escape the check entirely', () => {
    // `/patients/:id` consumes one segment. A deeper path is not a real route,
    // but it must still be checked against the base module rather than resolve
    // to `null` and skip the gate: a role without `patients` must be stopped
    // before React Router renders its 404.
    expect(moduleForPath('/patients/a/b/c')).toBe('patients');
  });
});

describe('registry integrity', () => {
  it('gives every route a module the server actually defines', () => {
    // Cheap drift guard: adding a module to the client registry that the server
    // does not know would silently deny a real page.
    for (const route of NAV_ROUTES) {
      expect(MODULE_KEYS, `route ${route.path}`).toContain(route.module);
    }
  });

  it('matches the server module list exactly', () => {
    const serverSource = readFileSync(
      resolve(REPO_ROOT, 'server/constants/permissions.js'),
      'utf8',
    );
    const serverKeys = [...serverSource.matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(serverKeys.length).toBeGreaterThan(0);
    for (const key of serverKeys) {
      expect(MODULE_KEYS, `server module ${key}`).toContain(key);
    }
  });

  it('has no duplicate paths', () => {
    const paths = NAV_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('assigns every sidebar item a known section', () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_SECTION_ORDER, item.path).toContain(item.section);
    }
  });

  it('stays importable from a node test environment', () => {
    // `roles.test.js` and this file both run in node, so the registry must not
    // pull in React or a browser API. Checked on the import list rather than
    // the whole file, so prose in the header comment is not a false positive.
    const source = readFileSync(resolve(CLIENT_SRC, 'lib/routes.js'), 'utf8');
    const imports = [...source.matchAll(/^import\s.*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(imports).toEqual([]);
    expect(source).not.toContain('<');
  });

  it('keeps the default landing path on a real route', () => {
    expect(NAV_ROUTES.some((r) => r.path === DEFAULT_LANDING_PATH)).toBe(true);
  });

  it('puts a nav:false route out of the sidebar but still gates it', () => {
    const emr = NAV_ROUTES.find((r) => r.path === '/patients/:id/emr');
    expect(emr.nav).toBe(false);
    expect(NAV_ITEMS).not.toContain(emr);
    expect(moduleForPath('/patients/x/emr')).toBe('emr');
  });

  describe('navRouteForModule', () => {
    it('resolves a sidebar module to its real path', () => {
      expect(navRouteForModule('patients')).toEqual(
        expect.objectContaining({ path: '/patients' }),
      );
      expect(navRouteForModule('roles').path).toBe('/roles');
      expect(navRouteForModule('settings').path).toBe('/settings');
    });

    it('refuses modules with no page of their own', () => {
      // `/${key}` used to be assumed. For emr that produced /emr, and for
      // platform_settings /platform_settings — neither exists, both render
      // the 404, and 404 matches no route so the permission guard never ran.
      expect(navRouteForModule('emr')).toBeNull();
      expect(navRouteForModule('platform_settings')).toBeNull();
      expect(navRouteForModule('queue')).toBeNull();
      expect(navRouteForModule('dental_chart')).toBeNull();
    });

    it('rejects unknown, empty and non-string modules without throwing', () => {
      expect(navRouteForModule('nope')).toBeNull();
      expect(navRouteForModule('')).toBeNull();
      expect(navRouteForModule(undefined)).toBeNull();
      expect(navRouteForModule(null)).toBeNull();
      expect(navRouteForModule(42)).toBeNull();
    });

    it('resolves a path for every module the sidebar offers', () => {
      // Guards the grid: it renders exactly the modules a link can reach, so
      // a new sidebar route must be linkable. Deduped by module because a
      // module can own several pages (appointments -> /appointments, /recalls).
      const modules = [...new Set(NAV_ITEMS.map((i) => i.module))];
      for (const module of modules) {
        expect(navRouteForModule(module)).toEqual(
          expect.objectContaining({ path: expect.any(String) }),
        );
      }
    });

    it('resolves to a real page of that module, not a guessed one', () => {
      const modules = [...new Set(NAV_ITEMS.map((i) => i.module))];
      for (const module of modules) {
        const resolved = navRouteForModule(module);
        const owns = NAV_ROUTES.filter((r) => r.nav !== false && r.module === module);
        expect(owns.map((r) => r.path)).toContain(resolved.path);
        // The primary page wins over secondary ones like /recalls.
        expect(resolved.path).toBe(owns[0].path);
      }
    });

    it('round-trips a resolved path back to the same module', () => {
      const modules = [...new Set(NAV_ITEMS.map((i) => i.module))];
      for (const module of modules) {
        expect(moduleForPath(navRouteForModule(module).path)).toBe(module);
      }
    });

    it('keeps a label key for every resolvable module', () => {
      for (const item of NAV_ITEMS) {
        expect(navRouteForModule(item.module).labelKey).toBeTruthy();
      }
    });
  });
});
