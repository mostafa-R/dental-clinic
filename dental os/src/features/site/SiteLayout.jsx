import { useEffect, useRef, useState } from 'react';
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

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SitePanel({ admin, filteredNav, t, onClose, onLogout }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <DentoCareLogo variant="light" showText={false} width={34} height={34} className="shrink-0" />
        <div>
          <p className="text-sm font-bold tracking-tight text-white">DentoCare</p>
          <p className="text-[11px] font-medium text-white/60">{t('site.adminPanel')}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t('site.nav.closeMenu')}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <nav className="scrollbar-dark flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {filteredNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
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
          onClick={onLogout}
          className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
        >
          {t('site.logout')}
        </button>
      </div>
    </>
  );
}

export default function SiteLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useT();
  const admin = useSelector((s) => s.siteAuth.admin);

  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const filteredNav = NAV_ITEMS.filter((item) => item.role.includes(admin?.role));

  const logout = async () => {
    await dispatch(siteLogout());
    navigate('/platform/login', { replace: true });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (drawerRef.current || menuButtonRef.current)?.focus?.();

    function onKeyDown(e) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      prevFocus?.focus?.();
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-dark lg:flex dark:bg-[#0e1c17]">
        <SitePanel admin={admin} filteredNav={filteredNav} t={t} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('site.adminPanel')}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside
            ref={drawerRef}
            tabIndex={-1}
            className="relative flex h-full w-60 shrink-0 flex-col bg-brand-dark outline-none dark:bg-[#0e1c17]"
          >
            <SitePanel
              admin={admin}
              filteredNav={filteredNav}
              t={t}
              onClose={() => setMobileOpen(false)}
              onLogout={logout}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ms-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
            aria-label={t('site.nav.openMenu')}
            aria-expanded={mobileOpen}
            aria-controls="site-mobile-nav"
          >
            <MenuIcon />
          </button>
          <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{t('site.adminPanel')}</h1>
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