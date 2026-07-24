import { useState, useRef, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../features/auth/authApi';
import { logout } from '../../features/auth/authSlice';
import { toggleMobileSidebar } from '../../features/ui/uiSlice';
import { disconnectSocket } from '../../lib/socket';
import { roleLabel } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import api from '../../lib/axios';
import PreferencesControls from '../../features/preferences/PreferencesControls';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SettingsIconSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.14A1.65 1.65 0 0 0 9.4 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.14A1.65 1.65 0 0 0 4.6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.14a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.14a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    function onMouseDown(e) { if (ref.current && !ref.current.contains(e.target)) handler(); }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [ref, handler]);
}

export default function Topbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({
    patients: [],
    appointments: [],
    invoices: [],
    branches: [],
    users: [],
    roles: [],
    inventory: [],
    expenses: [],
    drawings: [],
    treatmentPlans: [],
    prescriptions: [],
    clinicalNotes: [],
    wallets: [],
    installments: [],
  });
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);
  const chatUnread = useSelector((s) => s.chat.unread);
  const totalNotif = useMemo(
    () => Object.values(chatUnread).reduce((sum, n) => sum + n, 0),
    [chatUnread],
  );

  useClickOutside(menuRef, () => setShowUserMenu(false));
  useClickOutside(notifRef, () => setShowNotifMenu(false));
  useClickOutside(searchWrapRef, () => setShowSearch(false));

  // Debounced global search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults({
        patients: [], appointments: [], invoices: [],
        branches: [], users: [], roles: [],
        inventory: [], expenses: [], drawings: [],
        treatmentPlans: [], prescriptions: [], clinicalNotes: [],
        wallets: [], installments: [],
      });
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.data.data);
      } catch {
        setSearchResults({ patients: [], appointments: [], invoices: [] });
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const branchName = user?.branch?.name || t('topbar.noBranch');

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const onLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    dispatch(logout());
    disconnectSocket();
    navigate('/login', { replace: true });
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/patients?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setShowSearch(false);
    }
  };

  const initials = user?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      {/* Mobile menu toggle */}
      <button
        type="button"
        onClick={() => dispatch(toggleMobileSidebar())}
        className="-ms-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label="Toggle menu"
      >
        <MenuIcon />
      </button>

      {/* Branch badge */}
      <div className="hidden items-center gap-2.5 sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
          {branchName?.[0]?.toUpperCase() || '?'}
        </span>
        <div className="leading-tight">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{t('topbar.branch')}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{branchName}</p>
        </div>
      </div>

      <div className="hidden border-s border-slate-200 ps-4 dark:border-slate-700 sm:block" />

      {/* Global search */}
      <div className="relative hidden max-w-xs sm:block" ref={searchWrapRef}>
        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
          onFocus={() => { if (searchQuery.trim().length >= 2) setShowSearch(true); }}
          onKeyDown={onSearchKeyDown}
          placeholder={`${t('common.search')}…`}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pe-2 ps-8 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white dark:placeholder-slate-400 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20"
        />
        <kbd className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 lg:flex">
          <span className="text-[9px]">⌘</span>K
        </kbd>

        {/* Search results dropdown */}
        {showSearch && (searchQuery.trim().length >= 2 || searchLoading) && (
          <div className="absolute start-0 top-full z-50 mt-1 w-[calc(100vw-2rem)] max-w-lg origin-top-start rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
            {searchLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                {t('common.loading')}
              </div>
            ) : (
              <>
                {/* Patients */}
                {searchResults.patients.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('nav.patients')}</p>
                    {searchResults.patients.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => { navigate(`/patients?id=${p._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                          {`${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{p.firstName} {p.lastName}</p>
                          <p className="truncate text-xs text-slate-400">{p.phone || p.patientId}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Appointments */}
                {searchResults.appointments.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.appointments')}</p>
                    {searchResults.appointments.map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() => { navigate(`/appointments?id=${a._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                            {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : '—'}
                          </p>
                          <p className="truncate text-xs text-slate-400">{a.reason || a.doctor?.name || ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Invoices */}
                {searchResults.invoices.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.billing')}</p>
                    {searchResults.invoices.map((inv) => (
                      <button
                        key={inv._id}
                        type="button"
                        onClick={() => { navigate(`/billing?id=${inv._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{inv.invoiceNo}</p>
                          <p className="truncate text-xs text-slate-400">
                            {inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : '—'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Branches */}
                {searchResults.branches.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.branches')}</p>
                    {searchResults.branches.map((b) => (
                      <button
                        key={b._id}
                        type="button"
                        onClick={() => { navigate(`/branches?id=${b._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                          {b.name?.[0]?.toUpperCase() || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{b.name}</p>
                          <p className="truncate text-xs text-slate-400">{b.address || b.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Users */}
                {searchResults.users.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.users')}</p>
                    {searchResults.users.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => { navigate(`/users?id=${u._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-600 dark:bg-purple-500/20 dark:text-purple-300">
                          {u.name?.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{u.name}</p>
                          <p className="truncate text-xs text-slate-400">{u.email} • {u.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Roles */}
                {searchResults.roles.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.roles')}</p>
                    {searchResults.roles.map((r) => (
                      <button
                        key={r._id}
                        type="button"
                        onClick={() => { navigate(`/roles?id=${r._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                          {r.name?.[0]?.toUpperCase() || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                          <p className="truncate text-xs text-slate-400">{r.description || ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Inventory */}
                {searchResults.inventory.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.inventory')}</p>
                    {searchResults.inventory.map((item) => (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => { navigate(`/inventory?id=${item._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300">
                          {item.name?.[0]?.toUpperCase() || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
                          <p className="truncate text-xs text-slate-400">{item.sku || item.category} • Qty: {item.quantity}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Expenses */}
                {searchResults.expenses.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.accounting')}</p>
                    {searchResults.expenses.map((e) => (
                      <button
                        key={e._id}
                        type="button"
                        onClick={() => { navigate(`/accounting?expense=${e._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-300">
                          {e.expenseNo?.[0]?.toUpperCase() || 'E'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{e.expenseNo} - {e.description}</p>
                          <p className="truncate text-xs text-slate-400">{e.category} • {e.amount}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Drawings */}
                {searchResults.drawings.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.accounting')}</p>
                    {searchResults.drawings.map((d) => (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() => { navigate(`/accounting?drawing=${d._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                          {d.drawingNo?.[0]?.toUpperCase() || 'D'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{d.drawingNo} - {d.description || 'Owner Drawing'}</p>
                          <p className="truncate text-xs text-slate-400">{d.owner?.name || ''} • {d.amount}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Treatment Plans */}
                {searchResults.treatmentPlans.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.emr')}</p>
                    {searchResults.treatmentPlans.map((tp) => (
                      <button
                        key={tp._id}
                        type="button"
                        onClick={() => { navigate(`/patients/${tp.patient?._id}/emr?plan=${tp._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-600 dark:bg-teal-500/20 dark:text-teal-300">
                          {tp.title?.[0]?.toUpperCase() || 'T'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{tp.title}</p>
                          <p className="truncate text-xs text-slate-400">{tp.patient ? `${tp.patient.firstName} ${tp.patient.lastName}` : '—'} • {tp.status}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Prescriptions */}
                {searchResults.prescriptions.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.emr')}</p>
                    {searchResults.prescriptions.map((rx) => (
                      <button
                        key={rx._id}
                        type="button"
                        onClick={() => { navigate(`/patients/${rx.patient?._id}/emr?rx=${rx._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                          Rx
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{rx.diagnosis || 'Prescription'}</p>
                          <p className="truncate text-xs text-slate-400">{rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : '—'} • Dr. {rx.doctor?.name || ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Clinical Notes */}
                {searchResults.clinicalNotes.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.emr')}</p>
                    {searchResults.clinicalNotes.map((note) => (
                      <button
                        key={note._id}
                        type="button"
                        onClick={() => { navigate(`/patients/${note.patient?._id}/emr?note=${note._id}`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          📝
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{note.chiefComplaint || 'Clinical Note'}</p>
                          <p className="truncate text-xs text-slate-400">{note.patient ? `${note.patient.firstName} ${note.patient.lastName}` : '—'} • {new Date(note.visitDate).toLocaleDateString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Wallets */}
                {searchResults.wallets.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.wallet') || 'Wallet'}</p>
                    {searchResults.wallets.map((w) => (
                      <button
                        key={w._id}
                        type="button"
                        onClick={() => { navigate(`/patients/${w.patient._id}/emr?wallet=1`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-[10px] font-bold text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-300">
                          💰
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{w.patient.firstName} {w.patient.lastName}</p>
                          <p className="truncate text-xs text-slate-400">Balance: {w.balance}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Installments */}
                {searchResults.installments.length > 0 && (
                  <div>
                    <p className="border-t border-slate-100 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">{t('nav.wallet') || 'Installments'}</p>
                    {searchResults.installments.map((inst) => (
                      <button
                        key={inst._id}
                        type="button"
                        onClick={() => { navigate(`/patients/${inst.patient._id}/emr?installment=1`); setShowSearch(false); setSearchQuery(''); }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-100 text-[10px] font-bold text-pink-600 dark:bg-pink-500/20 dark:text-pink-300">
                          📅
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{inst.planNo} - {inst.patient.firstName} {inst.patient.lastName}</p>
                          <p className="truncate text-xs text-slate-400">{inst.paidAmount} / {inst.totalAmount} • {inst.status}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Empty */}
                {Object.values(searchResults).every((arr) => arr.length === 0) && (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">{t('common.noResults')}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Right section */}
      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <PreferencesControls />

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => { setShowNotifMenu((p) => !p); setShowUserMenu(false); }}
            className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Notifications"
          >
            <BellIcon />
            {totalNotif > 0 && (
              <>
                <span className="absolute end-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {totalNotif > 9 ? '9+' : totalNotif}
                </span>
              </>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute end-0 top-full mt-1 w-72 origin-top-end rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
              {totalNotif > 0 ? (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <p className="px-3 py-2 font-medium">{t('topbar.unreadMessages')}</p>
                  <button
                    type="button"
                    onClick={() => { navigate('/chat'); setShowNotifMenu(false); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                  >
                    <BellIcon />
                    <span>{t('topbar.viewChat')}</span>
                    <span className="ms-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{totalNotif}</span>
                  </button>
                </div>
              ) : (
                <p className="px-3 py-4 text-center text-sm text-slate-400">{t('topbar.noNotifications')}</p>
              )}
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((p) => !p)}
            className="flex items-center gap-2.5 rounded-lg p-1.5 pe-3 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="hidden text-start leading-tight md:block">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{roleLabel(user?.role)}</p>
            </div>
            <ChevronDownIcon />
          </button>

          {showUserMenu && (
            <div className="absolute end-0 top-full mt-1 w-56 origin-top-end rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
              <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700 md:hidden">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{roleLabel(user?.role)}</p>
              </div>
              <button
                type="button"
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <SettingsIconSmall />
                {t('settings.title')}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              >
                <LogOutIcon />
                {t('topbar.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
