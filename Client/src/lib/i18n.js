import { useEffect, useSyncExternalStore } from 'react';
import en from './i18n/en';

export const LANGS = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

const STORAGE_KEY = 'dentalos.lang';

function detectInitial() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  }
  return 'en';
}

let currentLang = detectInitial();
const listeners = new Set();

/**
 * Incremented on every notification.
 *
 * `getSnapshot` hands this to `useSyncExternalStore` instead of the language
 * itself: a lazily loaded catalogue arriving is a change worth re-rendering
 * for, and it does not change `currentLang`. Without the counter, subscribers
 * would compare equal snapshots and the Arabic text would never replace the
 * English fallback.
 */
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

/**
 * Loaded catalogues, keyed by language code. `en` is present from the first
 * render because it is both the default locale and the fallback for any key a
 * lazily loaded catalogue does not carry yet.
 */
const translations = { en };

/**
 * Non-default catalogues are separate chunks. `ar` is 64.7 kB raw / 15.1 kB
 * gzip, which every visitor was paying for in the initial bundle before
 * choosing to read it.
 */
const loaders = {
  ar: () => import('./i18n/ar').then((m) => m.default),
};

const pending = {};

/**
 * Loads a catalogue if it is not present yet. Resolves once the translations
 * can be served. A failure leaves the catalogue absent so `translate` keeps
 * falling back to `en`, and clears the slot so a later attempt can retry.
 */
function ensureDict(lang) {
  if (translations[lang]) return Promise.resolve(translations[lang]);
  const load = loaders[lang];
  if (!load) return Promise.resolve(translations.en);
  if (!pending[lang]) {
    pending[lang] = load()
      .then((dict) => {
        translations[lang] = dict;
      })
      .catch(() => {
        delete pending[lang];
      });
  }
  return pending[lang];
}

export function getLang() {
  return currentLang;
}

export function dirFor(lang) {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function isRTL() {
  return currentLang === 'ar';
}

export function applyDocumentLang(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirFor(lang);
}

export function setLanguage(lang) {
  if (lang !== 'en' && lang !== 'ar') return;
  if (lang === currentLang && translations[lang]) return;
  currentLang = lang;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentLang(lang);
  // Flip locale and direction immediately so the layout is correct right away.
  // The catalogue may still be in flight, in which case `translate` serves the
  // `en` fallback until it lands and the second `emit` swaps the text in.
  emit();
  void ensureDict(lang).then(emit);
}

function translate(key, vars) {
  const dict = translations[currentLang] || translations.en;
  let str = dict[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    }
  }
  return str;
}

export function t(key, vars) {
  return translate(key, vars);
}

/**
 * Human label for a permission/plan module key.
 *
 * Module keys are snake_case identifiers (`dental_chart`) that used to reach
 * the screen verbatim, so an Arabic visitor saw untranslated English on the
 * pricing table. The `mod.*` catalogue covers every module in
 * `server/constants/permissions.js`.
 *
 * `fallback` is the server-supplied English label, used for any key that is not
 * in the catalogue yet; without it an unknown key degrades to a humanised form
 * instead of printing the raw identifier, which still reads sensibly.
 */
export function moduleLabel(module, fallback) {
  if (!module) return module || fallback;
  const key = `mod.${module}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (fallback) return fallback;
  return String(module)
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return version;
}

/**
 * React hook subscribing to language changes. Returns the current language,
 * direction, the translation function, and a setter. Components using `t`
 * should call this hook so they re-render on language switch.
 */
export function useT() {
  // Subscribing to the version (not the language) means a catalogue that
  // finishes loading after the switch also refreshes the rendered text.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const lang = currentLang;
  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);
  return {
    t,
    lang,
    dir: dirFor(lang),
    setLang: setLanguage,
  };
}

// Apply the detected language to the document on module load (browser only).
applyDocumentLang(currentLang);

// A returning Arabic visitor is detected before its catalogue is available, so
// start fetching it now; `translate` serves `en` until it resolves.
if (currentLang !== 'en') void ensureDict(currentLang).then(emit);
