import { useSyncExternalStore } from 'react';

export const THEMES = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
];

const STORAGE_KEY = 'dentalos.theme';

function detectInitial() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

let currentTheme = detectInitial();
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function getTheme() {
  return currentTheme;
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  if (theme === currentTheme) return;
  currentTheme = theme;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentTheme;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { theme, setTheme };
}

// Apply the detected theme on module load (browser only).
applyTheme(currentTheme);
