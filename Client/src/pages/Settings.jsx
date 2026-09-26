import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import TabList from '../components/ui/TabList';
import TabPanel from '../components/ui/TabPanel';
import { useT } from '../lib/i18n';
import { roleLabel, useCanManageSettings, usePermission } from '../lib/roles';
import { useTabIds } from '../lib/tabs';
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

/**
 * Profile and Appearance are personal and readable by anyone who can open
 * Settings at all. WhatsApp is a clinic-wide integration: every one of its
 * endpoints is `settings:update` on the server (`/connect`, `/disconnect`,
 * `PUT /settings`, `/test`), so a read-only `settings` role used to see a tab
 * full of buttons that each answered 403.
 */
const TABS = [
  { key: 'profile', labelKey: 'settings.tab.profile', canView: () => true },
  { key: 'appearance', labelKey: 'settings.tab.appearance', canView: () => true },
  { key: 'whatsapp', labelKey: 'settings.tab.whatsapp', canView: (canRead, canManage) => canRead && canManage },
];

export default function Settings() {
  const { t } = useT();
  const { lang, theme, changeLanguage, changeTheme } = usePreferences();
  const user = useSelector((s) => s.auth.user);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('profile');
  const tabIds = useTabIds();

  const canReadSettings = usePermission('settings', 'read');
  const canManageSettings = useCanManageSettings();

  const visibleTabs = TABS.filter((tb) => tb.canView(canReadSettings, canManageSettings));
  // A plan downgrade or role change can revoke a tab while it is open; fall back
  // to Profile rather than rendering nothing under a dead tab button.
  const activeTab = visibleTabs.some((tb) => tb.key === tab) ? tab : visibleTabs[0]?.key;

  // The timer used to be parked on the function object itself, so it survived
  // across mounts and could fire into an unmounted component. A ref is the
  // right home for it, and clearing on unmount stops the leak entirely.
  const savedTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const flashSaved = () => {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2500);
  };

  const onLang = (next) => { changeLanguage(next); flashSaved(); };
  const onTheme = (next) => { changeTheme(next); flashSaved(); };

  const optionCls = (active) =>
    [
      'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition',
      active
        ? 'border-brand bg-brand/10 text-brand dark:text-brand-light'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
    ].join(' ');

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} subtitle={t('settings.appearanceHint')} />

      <TabList
        tabs={visibleTabs.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))}
        active={activeTab}
        onChange={setTab}
        label={t('settings.title')}
        ids={tabIds}
      />

      <TabPanel tabIds={tabIds} tabKey={activeTab}>
      {/* Profile */}
      {activeTab === 'profile' && user && (
        <Card title={user.name}>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="text-slate-500 dark:text-slate-400">{t('login.email')}</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">{user.email}</div>
            <div className="text-slate-500 dark:text-slate-400">{t('settings.role')}</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">
              {roleLabel(user.role)}
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
      {activeTab === 'appearance' && (
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
      {activeTab === 'whatsapp' && <WhatsAppSettings />}
      </TabPanel>

    </div>
  );
}
