import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

/**
 * Pins the behaviour of the per-language i18n split.
 *
 * `en` ships in the initial bundle; `ar` is a separate chunk (59.4 kB raw /
 * 14.9 kB gzip) fetched on demand, which keeps ~14 kB gzip out of the eager
 * payload. The split is invisible only if the switch path behaves, and there
 * are exactly two ways to break it:
 *
 *   1. selecting Arabic before the chunk arrives must render readable text -
 *      the `en` fallback - not raw keys or a blank screen;
 *   2. the chunk landing later must actually reach the screen. The
 *      subscription snapshot is a version counter, not the language, because
 *      the language does not change when the chunk arrives; a snapshot of
 *      `currentLang` would compare equal and Arabic would never replace the
 *      fallback.
 *
 * Expected copy is read from the catalogues rather than pasted in, so editing
 * a translation does not fail this suite - but the guard that the two
 * catalogues actually differ is kept, or the whole file would pass against a
 * no-op split.
 *
 * Needs the default jsdom environment for localStorage and document.dir.
 */

const enDict = (await import('./i18n/en')).default;
const arDict = (await import('./i18n/ar')).default;

const KEY = 'common.save';

describe('per-language i18n split', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock('./i18n/ar');
    vi.resetModules();
  });

  it('has catalogues that genuinely differ, so the rest of this file is meaningful', () => {
    expect(enDict[KEY]).not.toBe(arDict[KEY]);
    expect(Object.keys(enDict).length).toBe(Object.keys(arDict).length);
  });

  it('serves English synchronously, with no chunk fetched', async () => {
    const i18n = await import('./i18n');

    expect(i18n.getLang()).toBe('en');
    expect(i18n.t(KEY)).toBe(enDict[KEY]);
    // An unknown key degrades to itself rather than throwing.
    expect(i18n.t('common.nonexistent.key')).toBe('common.nonexistent.key');
  });

  it('interpolates variables', async () => {
    const i18n = await import('./i18n');

    const en = i18n.t('common.page', { page: 2, total: 7 });
    expect(en).toBe('Page 2 of 7');

    i18n.setLanguage('ar');
    await vi.waitFor(() => {
      expect(i18n.t('common.page', { page: 2, total: 7 })).not.toBe(en);
    });
    // Word order differs, so the interpolation must still fill both slots.
    expect(i18n.t('common.page', { page: 2, total: 7 })).toMatch(/2.*7/);
  });

  it('falls back to English the moment an unloaded locale is selected', async () => {
    const i18n = await import('./i18n');

    // The switch stays synchronous so direction flips immediately; the text
    // catches up when the chunk lands.
    i18n.setLanguage('ar');

    expect(i18n.getLang()).toBe('ar');
    expect(i18n.dirFor('ar')).toBe('rtl');
    expect(i18n.t(KEY)).toBe(enDict[KEY]);
  });

  it('serves Arabic once its catalogue has loaded', async () => {
    const i18n = await import('./i18n');

    i18n.setLanguage('ar');
    await vi.waitFor(() => {
      expect(i18n.t(KEY)).toBe(arDict[KEY]);
    });
  });

  it('re-renders a subscribed component when the chunk lands, though the language did not change', async () => {
    const i18n = await import('./i18n');
    let renders = 0;

    function Probe() {
      const { t, lang } = i18n.useT();
      renders += 1;
      return <span>{`${lang}|${t(KEY)}`}</span>;
    }

    const { container } = render(<Probe />);
    expect(container.textContent).toBe(`en|${enDict[KEY]}`);
    const beforeSwitch = renders;

    await act(async () => {
      i18n.setLanguage('ar');
    });
    const afterSwitch = renders;
    expect(afterSwitch).toBeGreaterThan(beforeSwitch);
    // The fallback window is a real, observable state.
    expect(container.textContent).toBe(`ar|${enDict[KEY]}`);

    // The language is still 'ar' here; only the catalogue changed. Without a
    // version-counter snapshot React would bail out and never paint Arabic.
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toBe(`ar|${arDict[KEY]}`);
      });
    });
    expect(renders).toBeGreaterThan(afterSwitch);
  });

  it('persists the choice and does not re-enter the fallback on re-selection', async () => {
    const i18n = await import('./i18n');

    i18n.setLanguage('ar');
    expect(localStorage.getItem('dentalos.lang')).toBe('ar');
    await vi.waitFor(() => {
      expect(i18n.t(KEY)).toBe(arDict[KEY]);
    });

    // Back and forth: the catalogue is already in memory, so Arabic is
    // available synchronously and there is no flash of English.
    i18n.setLanguage('en');
    expect(i18n.t(KEY)).toBe(enDict[KEY]);
    i18n.setLanguage('ar');
    expect(i18n.t(KEY)).toBe(arDict[KEY]);
  });

  it('keeps a readable result if the chunk fails to load', async () => {
    vi.doMock('./i18n/ar', () => {
      throw new Error('network down');
    });

    const i18n = await import('./i18n');
    await act(async () => {
      i18n.setLanguage('ar');
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The language switch itself succeeded; only the catalogue is missing, so
    // the UI shows English rather than keys.
    expect(i18n.getLang()).toBe('ar');
    expect(i18n.t(KEY)).toBe(enDict[KEY]);
  });
});
