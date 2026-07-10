import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getLang, setLanguage } from '../../lib/i18n';
import { getTheme, setTheme } from '../../lib/theme';
import { setPreferences } from '../auth/authSlice';
import { preferencesApi } from './preferencesApi';

/**
 * Central place for changing language/theme.
 * - Updates the client immediately (instant UI + LocalStorage cache).
 * - Persists to the server so preferences sync across devices/sessions.
 * - Updates the auth.user in the Redux store.
 *
 * When no user is authenticated, only the local cache is updated; the
 * server write is skipped (it will be applied on next login if the user
 * has saved preferences before).
 */
export function usePreferences() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);

  const persist = useCallback(
    (next) => {
      if (!user) return;
      dispatch(setPreferences(next));
      preferencesApi.update(next).catch(() => {
        // best-effort; local cache remains the source of truth for this session
      });
    },
    [dispatch, user],
  );

  const changeLanguage = useCallback(
    (lang) => {
      setLanguage(lang);
      persist({ language: lang });
    },
    [persist],
  );

  const changeTheme = useCallback(
    (theme) => {
      setTheme(theme);
      persist({ theme });
    },
    [persist],
  );

  return {
    lang: getLang(),
    theme: getTheme(),
    changeLanguage,
    changeTheme,
  };
}

/**
 * Apply server-stored preferences to the client once a user is loaded.
 * Server values are the source of truth when explicitly set; otherwise the
 * LocalStorage cache (applied before paint) is kept.
 */
export function applyServerPreferences(user) {
  if (!user?.preferences) return;
  const { language, theme } = user.preferences;
  if (language === 'en' || language === 'ar') setLanguage(language);
  if (theme === 'light' || theme === 'dark') setTheme(theme);
}
