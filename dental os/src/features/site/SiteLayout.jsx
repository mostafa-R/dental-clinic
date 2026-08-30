import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { siteLogout } from './siteAuthSlice';
import { useT } from '../../lib/i18n';

const NAV_ITEMS = [
  { to: '/platform/dashboard', key: 'site.nav.dashboard', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/tenants', key: 'site.nav.tenants', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/plans', key: 'site.nav.plans', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/subscriptions', key: 'site.nav.subscriptions', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/branches', key: 'site.nav.branches', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/audit', key: 'site.nav.audit', role: ['super_admin', 'admin', 'support'] },
  { to: '/platform/error-logs', key: 'site.nav.errorLogs', role: ['super_admin', 'admin'] },
  { to: '/platform/backups', key: 'site.nav.backups', role: ['super_admin', 'admin'] },
  { to: '/platform/settings', key: 'site.nav.settings', role: ['super_admin', 'admin', 'support'] },
];

export default function SiteLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const admin = useSelector((s) => s.siteAuth.admin);

  const logout = async () => {
    await dispatch(siteLogout());
    navigate('/platform/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="flex w-60 shrink-0 flex-col border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            D
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">{t('app.name')}</p>
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{t('site.adminPanel')}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.filter((item) => item.role.includes(admin?.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'block rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200',
                ].join(' ')
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{admin?.name}</p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{admin?.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t('site.logout')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t('site.adminPanel')}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}