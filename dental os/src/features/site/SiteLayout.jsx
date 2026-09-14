import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { siteLogout } from './siteAuthSlice';
import { useT } from '../../lib/i18n';
import { DentoCareLogo } from '../../components/ui/DentoCareLogo';

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
  const location = useLocation();
  const { t } = useT();
  const admin = useSelector((s) => s.siteAuth.admin);

  const logout = async () => {
    await dispatch(siteLogout());
    navigate('/platform/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas dark:bg-slate-950">
      <aside className="flex w-60 shrink-0 flex-col bg-brand-dark dark:bg-[#0e1c17]">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <DentoCareLogo variant="light" showText={false} width={34} height={34} className="shrink-0" />
          <div>
            <p className="text-sm font-bold tracking-tight text-white">DentoCare</p>
            <p className="text-[11px] font-medium text-white/60">{t('site.adminPanel')}</p>
          </div>
        </div>

        <nav className="scrollbar-dark flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.filter((item) => item.role.includes(admin?.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
                ].join(' ')
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{admin?.name}</p>
          <p className="truncate text-xs text-white/60">{admin?.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            {t('site.logout')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t('site.adminPanel')}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}