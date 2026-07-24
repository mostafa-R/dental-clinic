import { useT } from '../../lib/i18n';
import { usePreferences } from './usePreferences';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}

/**
 * Compact theme + language toggle group, used in the Topbar and Login.
 * Buttons are icon-first; the active option is highlighted.
 */
export default function PreferencesControls({ variant = 'inline' }) {
  const { t } = useT();
  const { lang, theme, changeLanguage, changeTheme } = usePreferences();

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition';

  return (
    <div className={`flex items-center gap-1 ${variant === 'stacked' ? 'flex-col' : ''}`}>
      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => changeLanguage('en')}
          aria-pressed={lang === 'en'}
          className={`${btnBase} ${
            lang === 'en'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => changeLanguage('ar')}
          aria-pressed={lang === 'ar'}
          className={`${btnBase} ${
            lang === 'ar'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          ع
        </button>
      </div>

      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => changeTheme('light')}
          aria-label={t('theme.light')}
          aria-pressed={theme === 'light'}
          className={`${btnBase} ${
            theme === 'light'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          <SunIcon />
        </button>
        <button
          type="button"
          onClick={() => changeTheme('dark')}
          aria-label={t('theme.dark')}
          aria-pressed={theme === 'dark'}
          className={`${btnBase} ${
            theme === 'dark'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          <MoonIcon />
        </button>
      </div>
    </div>
  );
}
