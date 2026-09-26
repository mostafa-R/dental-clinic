import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useT } from '../../lib/i18n';
import DentoCareLogo from '../ui/DentoCareLogo';
import { fetchMyPermissions } from '../../features/users/userSlice';
import { setSidebarCollapsed, setMobileSidebarOpen } from '../../features/ui/uiSlice';
import { NAV_ITEMS, NAV_SECTION_ORDER } from '../../lib/routes';
import { checkModuleAccess, useLandingPath } from '../../lib/roles';
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
  CloseIcon,
} from '../ui/icons';

const NAV_ICON = {
  '/dashboard': DashboardIcon,
  '/patients': PatientsIcon,
  '/appointments': AppointmentsIcon,
  '/recalls': AppointmentsIcon,
  '/billing': BillingIcon,
  '/accounting': AccountingIcon,
  '/inventory': InventoryIcon,
  '/branches': BranchesIcon,
  '/chat': ChatIcon,
  '/users': UsersIcon,
  '/roles': RolesIcon,
  '/settings': SettingsIcon,
};

/**
 * Group the route registry into sidebar sections. The path/module/section data
 * comes from `lib/routes.js`; this file only supplies the icons, so adding a
 * route cannot leave the menu out of sync with the URL guard.
 */
function buildNavSections() {
  return NAV_SECTION_ORDER.map((labelKey) => ({
    labelKey,
    items: NAV_ITEMS.filter((item) => item.section === labelKey),
  }));
}

const NAV_SECTIONS = buildNavSections();

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
  const landingPath = useLandingPath();

  const [hovered, setHovered] = useState(false);
  const previousPathRef = useRef(location.pathname);
  const mobilePanelRef = useRef(null);
  const persistReadyRef = useRef(false);

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
    // Skip the first run. Both of these effects fire on mount, so persisting
    // immediately wrote the default `false` over the stored preference before
    // the restore above had been applied — it only looked correct because the
    // restore re-triggered this effect a render later.
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    // Close the mobile drawer on *navigation* only.
    //
    // This used to list `mobileOpen` in its dependencies and dispatch a close
    // whenever it was true, so opening the drawer set state to true, the effect
    // re-ran, and immediately closed it again — the drawer could never stay
    // open. Comparing against the previous pathname closes on real navigation
    // without reacting to the drawer merely being opened.
    if (previousPathRef.current === location.pathname) return;
    previousPathRef.current = location.pathname;
    if (mobileOpen) dispatch(setMobileSidebarOpen(false));
  }, [location.pathname, mobileOpen, dispatch]);

  // Escape closes the drawer, and focus moves into it on open: it is a modal
  // dialog, so it must be reachable and dismissible from the keyboard alone.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') dispatch(setMobileSidebarOpen(false));
    };
    document.addEventListener('keydown', onKeyDown);
    mobilePanelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, dispatch]);

  const totalChatUnread = useMemo(
    () => Object.values(chatUnread).reduce((sum, n) => sum + n, 0),
    [chatUnread],
  );

  const filteredSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items
          .filter((item) => checkModuleAccess(myPermissions, item.module))
          .map((item) => ({ ...item, icon: NAV_ICON[item.path] })),
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
          landingPath={landingPath}
          totalChatUnread={totalChatUnread}
          t={t}
          onToggleCollapse={() => dispatch(setSidebarCollapsed(!collapsed))}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div id="app-mobile-nav" className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => dispatch(setMobileSidebarOpen(false))}
          />
          <aside
            ref={mobilePanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t('topbar.toggleMenu')}
            className="relative flex h-full w-56 shrink-0 flex-col overflow-hidden bg-brand-dark outline-none dark:bg-[#0e1c17]"
          >
            <SidebarContent
              collapsed={false}
              sections={filteredSections}
              location={location}
              landingPath={landingPath}
              totalChatUnread={totalChatUnread}
              t={t}
              onClose={() => dispatch(setMobileSidebarOpen(false))}
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
      to={item.path}
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
              {item.path === '/chat' && totalChatUnread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-rose-500/30">
                  {totalChatUnread > 99 ? '99+' : totalChatUnread}
                </span>
              )}
            </>
          )}

          {collapsed && item.path === '/chat' && totalChatUnread > 0 && (
            <span className="absolute end-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-brand-dark dark:ring-[#0e1c17]" />
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ collapsed, sections, location, landingPath, totalChatUnread, t, onToggleCollapse, onClose }) {
  return (
    <>
      {/* Logo — goes to the user's own landing page, not a hardcoded
          /dashboard, so a role without the dashboard module is not bounced
          every time they click the logo. */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
        <NavLink
          to={landingPath}
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
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpenIcon width={18} height={18} /> : <PanelLeftCloseIcon width={18} height={18} />}
          </button>
        )}

        {/* The drawer is a modal dialog, so it needs a real close control —
            the backdrop is not reachable by keyboard. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t('sidebar.close')}
          >
            <CloseIcon width={18} height={18} />
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
                  key={item.path}
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