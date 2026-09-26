import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useT } from '../../lib/i18n';
import DentoCareLogo from '../ui/DentoCareLogo';
import { fetchMyPermissions } from '../../features/users/userSlice';
import { setSidebarCollapsed, setMobileSidebarOpen } from '../../features/ui/uiSlice';
import {
  DashboardIcon,
  PatientsIcon,
  AppointmentsIcon,
  BillingIcon,
  AccountingIcon,
  InventoryIcon,
  ChatIcon,
  UsersIcon,
  RolesIcon,
  SettingsIcon,
  BranchIcon as BranchesIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '../ui/icons';

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', module: 'dashboard', icon: DashboardIcon },
    ],
  },
  {
    labelKey: 'nav.section.clinical',
    items: [
      { to: '/patients', labelKey: 'nav.patients', module: 'patients', icon: PatientsIcon },
      { to: '/appointments', labelKey: 'nav.appointments', module: 'appointments', icon: AppointmentsIcon },
      { to: '/recalls', labelKey: 'nav.recalls', module: 'appointments', icon: AppointmentsIcon },
    ],
  },
  {
    labelKey: 'nav.section.business',
    items: [
      { to: '/billing', labelKey: 'nav.billing', module: 'billing', icon: BillingIcon },
      { to: '/accounting', labelKey: 'nav.accounting', module: 'accounting', icon: AccountingIcon },
      { to: '/inventory', labelKey: 'nav.inventory', module: 'inventory', icon: InventoryIcon },
      { to: '/branches', labelKey: 'nav.branches', module: 'branches', icon: BranchesIcon },
    ],
  },
  {
    labelKey: 'nav.section.communication',
    items: [
      { to: '/chat', labelKey: 'nav.chat', module: 'chat', icon: ChatIcon },
    ],
  },
  {
    labelKey: 'nav.section.administration',
    items: [
      { to: '/users', labelKey: 'nav.users', module: 'users', icon: UsersIcon },
      { to: '/roles', labelKey: 'nav.roles', module: 'roles', icon: RolesIcon },
      { to: '/settings', labelKey: 'nav.settings', module: 'settings', icon: SettingsIcon },
    ],
  },
];

function hasAccess(permissions, module) {
  if (!module) return true;
  if (!permissions) return false;
  if (permissions.isSystemAdmin) return true;
  // Belt-and-suspenders: backend already intersects role perms with the plan
  // (getMyPermissions), but check planModules explicitly too so a stale or
  // hand-crafted payload can never show a module the subscription excludes.
  if (Array.isArray(permissions.planModules) && !permissions.planModules.includes(module)) {
    return false;
  }
  const actions = permissions.permissions?.[module];
  return Array.isArray(actions) && actions.length > 0;
}

export default function Sidebar() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { t } = useT();

  const user = useSelector((s) => s.auth.user);
  const myPermissions = useSelector((s) => s.users.myPermissions);
  const permissionsStatus = useSelector((s) => s.users.permissionsStatus);
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useSelector((s) => s.ui.mobileSidebarOpen);
  const chatUnread = useSelector((s) => s.chat.unread);

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (user && permissionsStatus === 'idle') {
      dispatch(fetchMyPermissions());
    }
  }, [dispatch, user, permissionsStatus]);

  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === 'true' && !collapsed) dispatch(setSidebarCollapsed(true));
    if (saved === 'false' && collapsed) dispatch(setSidebarCollapsed(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (mobileOpen) dispatch(setMobileSidebarOpen(false));
  }, [location.pathname, dispatch, mobileOpen]);

  const totalChatUnread = useMemo(
    () => Object.values(chatUnread).reduce((sum, n) => sum + n, 0),
    [chatUnread],
  );

  const filteredSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.alwaysShow || hasAccess(myPermissions, item.module)),
      })).filter((section) => section.items.length > 0),
    [myPermissions],
  );

  const isCollapsed = collapsed && !hovered;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`hidden shrink-0 flex-col overflow-hidden bg-brand-dark transition-all duration-300 lg:flex ${isCollapsed ? 'w-[56px]' : 'w-56'} dark:bg-[#0e1c17]`}
      >
        <SidebarContent
          collapsed={isCollapsed}
          sections={filteredSections}
          location={location}
          totalChatUnread={totalChatUnread}
          t={t}
          onToggleCollapse={() => dispatch(setSidebarCollapsed(!collapsed))}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div id="app-mobile-nav" className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('topbar.toggleMenu')}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => dispatch(setMobileSidebarOpen(false))} />
          <aside className="relative flex h-full w-56 shrink-0 flex-col overflow-hidden bg-brand-dark dark:bg-[#0e1c17]">
            <SidebarContent
              collapsed={false}
              sections={filteredSections}
              location={location}
              totalChatUnread={totalChatUnread}
              t={t}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function NavItem({ item, collapsed, totalChatUnread, t }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          'group relative flex items-center rounded-lg text-sm font-medium transition-colors duration-150',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
        ].join(' ')
      }
      title={collapsed ? t(item.labelKey) : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-smile" />
          )}
          {isActive && collapsed && (
            <span className="absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-smile" />
          )}

          <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${isActive ? 'text-smile' : ''}`}>
            <Icon width={18} height={18} />
          </span>

          {!collapsed && (
            <>
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
              {item.to === '/chat' && totalChatUnread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-rose-500/30">
                  {totalChatUnread > 99 ? '99+' : totalChatUnread}
                </span>
              )}
            </>
          )}

          {collapsed && item.to === '/chat' && totalChatUnread > 0 && (
            <span className="absolute end-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-brand-dark dark:ring-[#0e1c17]" />
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ collapsed, sections, location, totalChatUnread, t, onToggleCollapse }) {
  return (
    <>
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
        <NavLink
          to="/dashboard"
          className={`flex items-center ${collapsed ? 'flex-1 justify-center' : 'flex-1 gap-3'}`}
        >
          <DentoCareLogo
            variant="light"
            width={collapsed ? 30 : 150}
            height={collapsed ? 30 : 40}
            showText={!collapsed}
            className="shrink-0"
          />
        </NavLink>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            {collapsed ? <PanelLeftOpenIcon width={18} height={18} /> : <PanelLeftCloseIcon width={18} height={18} />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="scrollbar-dark flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-6' : ''}>
            {section.labelKey && !collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                {t(section.labelKey)}
              </p>
            )}
            {section.labelKey && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-white/15" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  location={location}
                  totalChatUnread={totalChatUnread}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}