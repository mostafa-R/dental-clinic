import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';

import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import SettingRow from '../components/ui/SettingRow';
import TabList from '../components/ui/TabList';
import TabPanel from '../components/ui/TabPanel';
import { BuildingIcon, MailIcon, MoonIcon, SunIcon, UserIcon } from '../components/ui/icons';
import { useT } from '../lib/i18n';
import { useCanManageSettings, usePermission, userRoleLabel } from '../lib/roles';
import { useTabIds } from '../lib/tabs';
import { usePreferences } from '../features/preferences/usePreferences';
import WhatsAppSettings from '../features/settings/WhatsAppSettings';

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

const DEFAULT_TAB = TABS[0].key;

/** Initials for the avatar fallback — no image is loaded for the signed-in user. */
function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Settings() {
  const { t } = useT();
  const { lang, theme, changeLanguage, changeTheme } = usePreferences();
  const user = useSelector((s) => s.auth.user);
  const [saved, setSaved] = useState(false);
  const tabIds = useTabIds();
  const [searchParams, setSearchParams] = useSearchParams();

  const canReadSettings = usePermission('settings', 'read');
  const canManageSettings = useCanManageSettings();

  const visibleTabs = TABS.filter((tb) => tb.canView(canReadSettings, canManageSettings));

  // The tab lives in the URL so a specific panel can be linked to and survives a
  // reload; an unknown or no-longer-permitted `?tab=` falls back to the first
  // tab this user can actually see rather than rendering an empty panel.
  const requestedTab = searchParams.get('tab');
  const activeTab = visibleTabs.some((tb) => tb.key === requestedTab)
    ? requestedTab
    : DEFAULT_TAB;

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (requestedTab && !visibleTabs.some((tb) => tb.key === requestedTab)) {
      // Normalise a stale ?tab= so the next reload does not re-resolve it.
      const next = new URLSearchParams(searchParams);
      next.set('tab', visibleTabs[0].key);
      setSearchParams(next, { replace: true });
    }
  }, [requestedTab, visibleTabs, searchParams, setSearchParams]);

  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next);
  };

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

  // `/auth/me` and `login` both ship the role populated (`role` key plus a
  // populated `roleId`), so this resolves through every shape the API can
  // return — a session restored from an older token still yields '' rather than
  // an ObjectId. Resolved in one place so the badge and the detail row can
  // never disagree.
  const roleText = userRoleLabel(user);

  const profileFacts = user
    ? [
        { key: 'email', icon: <MailIcon width={16} height={16} />, label: t('login.email'), value: user.email },
        ...(roleText
          ? [{ key: 'role', icon: <UserIcon width={16} height={16} />, label: t('settings.role'), value: roleText }]
          : []),
        ...(user.branch?.name
          ? [{ key: 'branch', icon: <BuildingIcon width={16} height={16} />, label: t('settings.branch'), value: user.branch.name }]
          : []),
      ]
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <TabList
        tabs={visibleTabs.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))}
        active={activeTab}
        onChange={setTab}
        label={t('settings.title')}
        ids={tabIds}
      />

      <TabPanel tabIds={tabIds} tabKey={activeTab}>
        {/* Profile — read-only. Identity fields are owned by whoever administers
            the account, so the card states that rather than showing controls
            that would not work. */}
        {activeTab === 'profile' && user && (
          <div className="space-y-6">
            <Card padded={false}>
              <div className="flex flex-wrap items-center gap-4 p-5">
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-lg font-semibold text-brand-dark ring-1 ring-brand/15 dark:bg-brand/15 dark:text-brand-light dark:ring-brand/20"
                >
                  {initialsOf(user.name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                    {user.name}
                  </h2>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
                {/* Omitted entirely when the role cannot be resolved, so the
                    card never shows an empty chip. */}
                {roleText && (
                  <span className="ms-auto rounded-full bg-brand/5 px-2.5 py-1 text-xs font-medium text-brand-dark dark:bg-brand/20 dark:text-brand-light">
                    {roleText}
                  </span>
                )}
              </div>
            </Card>

            <Card title={t('settings.profile.details')}>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                {profileFacts.map((fact) => (
                  <div key={fact.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <dt className="flex min-w-0 flex-1 items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
                      <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">{fact.icon}</span>
                      {fact.label}
                    </dt>
                    <dd className="min-w-0 break-words text-end text-sm font-medium text-slate-800 dark:text-slate-100">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
                {t('settings.profile.managedHint')}
              </p>
            </Card>
          </div>
        )}

        {/* Appearance — every change applies instantly and is persisted by
            `usePreferences`, so there is no Save button by design. */}
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <Card title={t('settings.appearance')}>
              <div className="space-y-6">
                <SettingRow
                  label={t('settings.language')}
                  description={t('settings.languageHint')}
                >
                  <SegmentedControl
                    label={t('settings.language')}
                    value={lang}
                    onChange={onLang}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'ar', label: 'العربية' },
                    ]}
                  />
                </SettingRow>

                <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                  <SettingRow
                    label={t('settings.theme')}
                    description={t('settings.themeHint')}
                  >
                    <SegmentedControl
                      label={t('settings.theme')}
                      value={theme}
                      onChange={onTheme}
                      options={[
                        { value: 'light', label: t('theme.light'), icon: <SunIcon width={16} height={16} /> },
                        { value: 'dark', label: t('theme.dark'), icon: <MoonIcon width={16} height={16} /> },
                      ]}
                    />
                  </SettingRow>
                </div>
              </div>
            </Card>

            {/* Announced as a live region: the change is applied instantly, so
                without this the confirmation would be visual-only feedback for
                an action that has no other visible effect. */}
            <div role="status" aria-live="polite" className="min-h-5">
              {saved && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <span aria-hidden="true">✓</span>
                  {t('settings.saved')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* WhatsApp */}
        {activeTab === 'whatsapp' && <WhatsAppSettings />}
      </TabPanel>
    </div>
  );
}