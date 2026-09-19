import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import api from "../lib/axios";
import { t } from "../lib/i18n";
import { canUserAccess } from "../lib/permissions";
import {
  BuildingOfficeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "./ui/icons";

const PAGE_NAV = [
  { nameKey: "dashboard", href: "/", accessKey: "dashboard" },
  { nameKey: "tenants", href: "/tenants", accessKey: "tenants" },
  { nameKey: "branches", href: "/branches", accessKey: "branches" },
  { nameKey: "plans", href: "/plans", accessKey: "plans" },
  { nameKey: "billing", href: "/billing", accessKey: "billing" },
  { nameKey: "analytics", href: "/analytics", accessKey: "analytics" },
  { nameKey: "admins", href: "/admins", accessKey: "admins" },
  { nameKey: "featureFlags", href: "/feature-flags", accessKey: "featureFlags" },
  { nameKey: "quarantine", href: "/quarantine", accessKey: "quarantine" },
  { nameKey: "health", href: "/health", accessKey: "health" },
  { nameKey: "performance", href: "/performance", accessKey: "performance" },
  { nameKey: "auditLogs", href: "/audit-logs", accessKey: "auditLogs" },
  { nameKey: "errorLogs", href: "/error-logs", accessKey: "errorLogs" },
  { nameKey: "alerts", href: "/alerts", accessKey: "alerts" },
  { nameKey: "backups", href: "/backups", accessKey: "backups" },
  { nameKey: "settings", href: "/settings", accessKey: "settings" },
];

const ACTIONS = [
  {
    id: "action:create-tenant",
    nameKey: "createTenantAction",
    sub: "/tenants?new=1",
    href: "/tenants?new=1",
    accessKey: "tenants.create",
  },
];

const RECENT_KEY = "palette_recent";
const RECENT_LIMIT = 6;

// Ranked fuzzy match: exact > prefix > substring > subsequence (-1 = no match).
const fuzzyScore = (text, q) => {
  const s = (text || "").toLowerCase();
  if (!q) return 1;
  if (s === q) return 100;
  if (s.startsWith(q)) return 75;
  if (s.includes(q)) return 50;
  let pos = 0;
  for (const ch of q) {
    pos = s.indexOf(ch, pos);
    if (pos === -1) return -1;
    pos += 1;
  }
  return 25;
};

const loadRecent = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function CommandPalette() {
  const navigate = useNavigate();
  const { language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tenants, setTenants] = useState([]);
  const [recent, setRecent] = useState(loadRecent);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const queryRef = useRef("");
  const timerRef = useRef(null);

  const visiblePages = useMemo(
    () => PAGE_NAV.filter((p) => canUserAccess(user, p.accessKey)),
    [user],
  );

  const visibleActions = useMemo(
    () => ACTIONS.filter((a) => canUserAccess(user, a.accessKey)),
    [user],
  );

  const q = query.trim().toLowerCase();

  const filteredActions = useMemo(
    () =>
      visibleActions.filter(
        (a) => fuzzyScore(t(a.nameKey, language), q) >= 0,
      ),
    [visibleActions, q, language],
  );

  const recentItems = useMemo(() => {
    const list = q === ""
      ? recent
      : recent.filter((r) => fuzzyScore(r.label, q) >= 0);
    return list.map((r) => ({ ...r, group: "recentGroup" }));
  }, [recent, q]);

  const rankedPages = useMemo(() => {
    const scored = visiblePages.map((p) => ({
      page: p,
      score: fuzzyScore(t(p.nameKey, language), q),
    }));
    return scored
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.page);
  }, [visiblePages, q, language]);

  const results = useMemo(() => {
    const seen = new Set(recentItems.map((r) => r.id));
    const actionItems = filteredActions.map((a) => ({
      id: a.id,
      type: "action",
      label: t(a.nameKey, language),
      sublabel: a.sub,
      href: a.href,
      group: "actionsGroup",
    }));
    actionItems.forEach((i) => seen.add(i.id));
    const pageItems = rankedPages
      .map((p) => ({
        id: `page:${p.href}`,
        type: "page",
        label: t(p.nameKey, language),
        sublabel: p.href,
        href: p.href,
        group: "searchPages",
      }))
      .filter((i) => !seen.has(i.id));
    pageItems.forEach((i) => seen.add(i.id));
    const tenantItems = tenants
      .map((tn) => ({
        id: `tenant:${tn._id}`,
        type: "tenant",
        label: tn.name,
        sublabel: tn.email || tn.plan || "",
        href: `/tenants/${tn._id}`,
        group: "searchTenantsGroup",
      }))
      .filter((i) => !seen.has(i.id));
    return [...actionItems, ...recentItems, ...pageItems, ...tenantItems];
  }, [filteredActions, recentItems, rankedPages, tenants, language]);

  const recordRecent = (item) => {
    setRecent((prev) => {
      const next = [
        {
          id: item.id,
          type: item.type,
          label: item.label,
          sublabel: item.sublabel,
          href: item.href,
        },
        ...prev.filter((r) => r.id !== item.id),
      ].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const go = (item) => {
    if (!item) return;
    recordRecent(item);
    navigate(item.href);
    setOpen(false);
  };

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("command-palette:open", onOpen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("command-palette:open", onOpen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTenants([]);
    setSelectedIndex(0);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(focusTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  useEffect(() => {
    queryRef.current = query;
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTenants([]);
      setLoadingTenants(false);
      setSelectedIndex(0);
      return;
    }
    setLoadingTenants(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get("/tenants", {
          params: { search: trimmed, page: 1, limit: 8 },
        });
        if (queryRef.current.trim() === trimmed) {
          setTenants(res.data.tenants || []);
        }
      } catch {
        if (queryRef.current.trim() === trimmed) setTenants([]);
      } finally {
        if (queryRef.current.trim() === trimmed) setLoadingTenants(false);
      }
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, tenants]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(results[selectedIndex]);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, selectedIndex]);

  if (!open) return null;

  const showNoResults = !loadingTenants && results.length === 0;
  let lastGroup = null;

  const itemIcon = (item) => {
    if (item.type === "action") return <PlusIcon className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (item.type === "tenant") return <BuildingOfficeIcon className="w-4 h-4 text-slate-400 shrink-0" />;
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("commandPalette", language)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-700">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPlaceholder", language)}
            className="flex-1 py-4 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-base"
            aria-label={t("commandPalette", language)}
          />
          <kbd className="hidden sm:inline-block text-xs font-semibold text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto" role="listbox" aria-label={t("commandResults", language)}>
          {showNoResults && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {t("noResultsFound", language)}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {t("noResultsDesc", language)}
              </p>
            </div>
          )}

          {results.map((item, idx) => {
            const header = item.group !== lastGroup
              ? (
                <p
                  key={`group-${item.group}-${idx}`}
                  className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
                >
                  {t(item.group, language)}
                </p>
              )
              : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header}
                <button
                  onClick={() => go(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-start px-4 py-2.5 flex items-center gap-3 text-sm ${
                    selectedIndex === idx
                      ? "bg-indigo-50 dark:bg-indigo-900/40"
                      : ""
                  }`}
                  role="option"
                  aria-selected={selectedIndex === idx}
                >
                  {itemIcon(item)}
                  <span className="truncate font-medium text-slate-900 dark:text-white">
                    {item.label}
                  </span>
                  <span className="ms-auto text-xs text-slate-400 dark:text-slate-500 truncate">
                    {item.sublabel}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 dark:text-slate-500">
          <span>
            <kbd className="font-semibold">↑↓</kbd> {t("toNavigate", language)}
          </span>
          <span>
            <kbd className="font-semibold">Enter</kbd> {t("toSelect", language)}
          </span>
          <span className="hidden md:inline">
            {t("shortcutsHint", language)}
          </span>
          <span className="ms-auto">
            {loadingTenants ? t("searching", language) : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
