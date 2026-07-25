import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useT } from '../../lib/i18n';
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
    label: 'Clinical',
    items: [
      { to: '/patients', labelKey: 'nav.patients', module: 'patients', icon: PatientsIcon },
      { to: '/appointments', labelKey: 'nav.appointments', module: 'appointments', icon: AppointmentsIcon },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/billing', labelKey: 'nav.billing', module: 'billing', icon: BillingIcon },
      { to: '/accounting', labelKey: 'nav.accounting', module: 'accounting', icon: AccountingIcon },
      { to: '/inventory', labelKey: 'nav.inventory', module: 'inventory', icon: InventoryIcon },
      { to: '/branches', labelKey: 'nav.branches', module: 'branches', icon: BranchesIcon },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/chat', labelKey: 'nav.chat', icon: ChatIcon, alwaysShow: true },
    ],
  },
  {
    label: 'Administration',
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
  const actions = permissions.permissions?.[module];
  return actions && actions.length > 0;
}

function isActivePath(pathname, to) {
  return to === '/dashboard' ? pathname === to : pathname.startsWith(to);
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
  }, [location.pathname, dispatch]);

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
        className={`hidden shrink-0 flex-col overflow-hidden border-e border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:flex ${isCollapsed ? 'w-[56px]' : 'w-56'}`}
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
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => dispatch(setMobileSidebarOpen(false))} />
          <aside className="relative flex h-full w-56 shrink-0 flex-col overflow-hidden border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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

function NavItem({ item, collapsed, location, totalChatUnread, t }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-500/15 dark:text-indigo-300'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200',
        ].join(' ')
      }
      title={collapsed ? t(item.labelKey) : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute start-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
          )}
          {isActive && collapsed && (
            <span className="absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
          )}

          <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${isActive ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
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
            <span className="absolute end-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
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
      <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-4 dark:border-slate-800">
        <NavLink
          to="/dashboard"
          className={`flex items-center ${collapsed ? 'flex-1 justify-center' : 'flex-1 gap-3'}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            D
          </span>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {t('app.name')}
            </span>
          )}
        </NavLink>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            {collapsed ? <PanelLeftOpenIcon width={18} height={18} /> : <PanelLeftCloseIcon width={18} height={18} />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-6' : ''}>
            {section.label && !collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.label}
              </p>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-slate-200 dark:bg-slate-700" />
            )}
            <div className="space-y-0.5">
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
