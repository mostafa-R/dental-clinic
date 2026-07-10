import { useState } from 'react';
import { useSelector } from 'react-redux';

import Card from '../components/ui/Card';
import { useT } from '../lib/i18n';
import { usePreferences } from '../features/preferences/usePreferences';
import WhatsAppSettings from '../features/settings/WhatsAppSettings';

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}

const TABS = [
  { key: 'profile', labelKey: 'settings.tab.profile' },
  { key: 'appearance', labelKey: 'settings.tab.appearance' },
  { key: 'whatsapp', labelKey: 'settings.tab.whatsapp' },
];

export default function Settings() {
  const { t } = useT();
  const { lang, theme, changeLanguage, changeTheme } = usePreferences();
  const user = useSelector((s) => s.auth.user);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('profile');

  const flashSaved = () => {
    setSaved(true);
    window.clearTimeout(flashSaved._timer);
    flashSaved._timer = window.setTimeout(() => setSaved(false), 2500);
  };

  const onLang = (next) => { changeLanguage(next); flashSaved(); };
  const onTheme = (next) => { changeTheme(next); flashSaved(); };

  const optionCls = (active) =>
    [
      'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition',
      active
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
    ].join(' ');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('settings.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.appearanceHint')}</p>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === tb.key
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {/* Profile */}
      {tab === 'profile' && user && (
        <Card title={user.name}>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="text-slate-500 dark:text-slate-400">{t('login.email')}</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">{user.email}</div>
            <div className="text-slate-500 dark:text-slate-400">{t('settings.role')}</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">
              {user.role}
            </div>
            {user.branch?.name && (
              <>
                <div className="text-slate-500 dark:text-slate-400">{t('settings.branch')}</div>
                <div className="font-medium text-slate-800 dark:text-slate-100">{user.branch.name}</div>
              </>
            )}
          </dl>
        </Card>
      )}

      {/* Appearance */}
      {tab === 'appearance' && (
        <Card title={t('settings.appearance')}>
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.language')}</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => onLang('en')} className={optionCls(lang === 'en')}>English</button>
                <button type="button" onClick={() => onLang('ar')} className={optionCls(lang === 'ar')}>العربية</button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.theme')}</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => onTheme('light')} className={optionCls(theme === 'light')}><SunIcon />{t('theme.light')}</button>
                <button type="button" onClick={() => onTheme('dark')} className={optionCls(theme === 'dark')}><MoonIcon />{t('theme.dark')}</button>
              </div>
            </div>
            {saved && <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t('settings.saved')}</p>}
          </div>
        </Card>
      )}

      {/* WhatsApp */}
      {tab === 'whatsapp' && <WhatsAppSettings />}

    </div>
  );
}
