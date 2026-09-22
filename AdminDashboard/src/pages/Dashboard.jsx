import { Fragment, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import DashboardTour from "../components/DashboardTour";
import {
  BanknoteIcon,
  Bars3Icon,
  BellIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  CogIcon,
  ExclamationTriangleIcon,
  UsersIcon,
} from "../components/ui/icons";
import { fetchGlobalStats, fetchGrowthData } from "../features/analytics/analyticsSlice";
import { fetchActiveAlerts } from "../features/alerts/alertsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import api from "../lib/axios";
import { formatCurrency, formatNumber } from "../lib/format";
import { t } from "../lib/i18n";
import { TENANT_STATUS } from "../lib/roles";

const STORAGE_KEY = "dashboard_cards";
const TOUR_KEY = "dashboard_tour_done";

const CARDS = [
  { key: "totalTenants", titleKey: "cardTotalTenants" },
  { key: "activeTenants", titleKey: "cardActiveTenants" },
  { key: "monthlyRevenue", titleKey: "cardMonthlyRevenue" },
  { key: "totalPatients", titleKey: "cardTotalPatients" },
  { key: "revenueOverview", titleKey: "cardRevenueOverview" },
  { key: "platformStatistics", titleKey: "cardPlatformStatistics" },
  { key: "planDistribution", titleKey: "cardPlanDistribution" },
  { key: "statusDistribution", titleKey: "cardStatusDistribution" },
  { key: "recentAlerts", titleKey: "cardRecentAlerts" },
  { key: "monthlyComparison", titleKey: "cardMonthlyComparison" },
  { key: "atRisk", titleKey: "cardAtRisk" },
];

const STAT_KEYS = ["totalTenants", "activeTenants", "monthlyRevenue", "totalPatients"];
const FULL_KEYS = ["atRisk"];

const DEFAULT_LAYOUT = {
  enabled: CARDS.map((c) => c.key),
  order: CARDS.map((c) => c.key),
};

const PLAN_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
];

const STATUS_COLORS = {
  [TENANT_STATUS.ACTIVE]: "bg-emerald-500",
  [TENANT_STATUS.TRIAL]: "bg-blue-500",
  [TENANT_STATUS.SUSPENDED]: "bg-rose-500",
  [TENANT_STATUS.CANCELLED]: "bg-amber-500",
  [TENANT_STATUS.ARCHIVED]: "bg-slate-400",
};

const STATUS_ORDER = [
  TENANT_STATUS.ACTIVE,
  TENANT_STATUS.TRIAL,
  TENANT_STATUS.SUSPENDED,
  TENANT_STATUS.CANCELLED,
  TENANT_STATUS.ARCHIVED,
];

function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    const known = CARDS.map((c) => c.key);
    if (Array.isArray(parsed)) {
      // Legacy: plain enabled-keys array.
      return { enabled: known.filter((k) => parsed.includes(k)), order: [...known] };
    }
    if (parsed && Array.isArray(parsed.enabled) && Array.isArray(parsed.order)) {
      const enabled = known.filter((k) => parsed.enabled.includes(k));
      const order = parsed.order.filter((k) => known.includes(k));
      known.forEach((k) => {
        if (!order.includes(k)) order.push(k);
      });
      return { enabled, order };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const { stats, growthData, loading } = useSelector((state) => state.analytics);
  const { active: activeAlerts } = useSelector((state) => state.alerts);
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const [layout, setLayout] = useState(loadLayout);
  const [customizing, setCustomizing] = useState(false);
  const [distribution, setDistribution] = useState({ byPlan: {}, byStatus: {}, total: 0 });
  const [distLoading, setDistLoading] = useState(true);
  const [atRisk, setAtRisk] = useState({ trials: 0, dormant: 0 });
  const [tourOpen, setTourOpen] = useState(() => {
    try {
      return !localStorage.getItem(TOUR_KEY);
    } catch {
      return false;
    }
  });
  const dragKey = useRef(null);

  useEffect(() => {
    dispatch(fetchGlobalStats());
    dispatch(fetchPlans());
    dispatch(fetchGrowthData("12months"));
    dispatch(fetchActiveAlerts());
    const timer = setInterval(() => dispatch(fetchActiveAlerts()), 30000);
    return () => clearInterval(timer);
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const loadDistribution = async () => {
      setDistLoading(true);
      try {
        const all = [];
        let page = 1;
        let total = Infinity;
        while (all.length < total && page <= 10) {
          const { data } = await api.get("/tenants", { params: { page, limit: 100 } });
          const tenants = data.tenants || [];
          if (tenants.length === 0) break;
          all.push(...tenants);
          total = data.pagination?.total ?? all.length;
          page += 1;
        }
        if (cancelled) return;
        const byPlan = {};
        const byStatus = {};
        all.forEach((tn) => {
          const p = tn.plan || "free";
          byPlan[p] = (byPlan[p] || 0) + 1;
          const s = STATUS_ORDER.includes(tn.status) ? tn.status : TENANT_STATUS.ACTIVE;
          byStatus[s] = (byStatus[s] || 0) + 1;
        });
        setDistribution({ byPlan, byStatus, total: all.length });
      } finally {
        if (!cancelled) setDistLoading(false);
      }
    };
    loadDistribution();
    const loadAtRisk = async () => {
      try {
        const [trialsRes, dormantRes] = await Promise.all([
          api.get("/tenants", { params: { page: 1, limit: 1, trialExpiring: 7 } }),
          api.get("/tenants", { params: { page: 1, limit: 1, dormant: true } }),
        ]);
        if (cancelled) return;
        setAtRisk({
          trials: trialsRes.data.pagination?.total ?? 0,
          dormant: dormantRes.data.pagination?.total ?? 0,
        });
      } catch {
        /* ignore */
      }
    };
    loadAtRisk();
    return () => {
      cancelled = true;
    };
  }, []);

  const planName = (key) => {
    const p = plans.find((pl) => pl.key === key);
    return p?.name || key;
  };

  const statusLabel = (s) =>
    t("status" + s.charAt(0).toUpperCase() + s.slice(1), language) ||
    s?.charAt(0).toUpperCase() + s?.slice(1);

  const SEVERITY_DOT = {
    critical: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  const compareLastTwo = (arr) => {
    const list = [...(arr || [])].sort((a, b) =>
      a.month < b.month ? -1 : 1,
    );
    if (list.length < 2) return null;
    const [prev, curr] = list.slice(-2);
    const delta = curr.count - prev.count;
    const pct =
      prev.count === 0 ? (curr.count > 0 ? 100 : 0) : (delta / prev.count) * 100;
    return { prev: prev.count, curr: curr.count, month: curr.month, delta, pct };
  };

  const tenantCmp = compareLastTwo(growthData?.tenants);
  const revenueCmp = compareLastTwo(growthData?.revenue);
  const patientCmp = compareLastTwo(growthData?.patients);

  const CmpRow = ({ label, data, money }) => {
    if (!data) {
      return (
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <span className="text-slate-600 dark:text-slate-300">{label}</span>
          <span className="text-sm text-slate-400">{t("noData", language)}</span>
        </div>
      );
    }
    const up = data.delta >= 0;
    return (
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
        <div>
          <p className="text-slate-600 dark:text-slate-300">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5" dir="ltr">
            {data.month} · {t("vsPreviousMonth", language)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {money ? formatCurrency(data.curr, "USD", language) : formatNumber(data.curr, language)}
          </p>
          <p className={`text-sm font-medium ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {up ? "↑" : "↓"} {(up ? "+" : "") + data.delta} ({(up ? "+" : "") + data.pct.toFixed(1)}%)
          </p>
        </div>
      </div>
    );
  };

  const DistBar = ({ label, count, total, color }) => (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: total > 0 ? `${Math.max(2, (count / total) * 100)}%` : "0%" }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-900 dark:text-white">
        {count}
      </span>
    </div>
  );

  const updateLayout = (next) => {
    setLayout(next);
    saveLayout(next);
  };

  const toggleCard = (key) => {
    const next = layout.enabled.includes(key)
      ? layout.enabled.filter((k) => k !== key)
      : [...layout.enabled, key];
    updateLayout({ ...layout, enabled: next });
  };

  const resetCards = () => {
    updateLayout({ ...DEFAULT_LAYOUT });
  };

  const moveCard = (fromKey, toKey) => {
    const order = [...layout.order];
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    updateLayout({ ...layout, order });
  };

  if (loading && !stats.totalTenants) {
    return <PageLoader />;
  }

  const show = (key) => layout.enabled.includes(key);
  const modalKeys = [...layout.order, ...CARDS.map((c) => c.key).filter((k) => !layout.order.includes(k))];
  const orderedStats = STAT_KEYS.filter(show).sort(
    (a, b) => layout.order.indexOf(a) - layout.order.indexOf(b),
  );
  const orderedFlow = layout.order.filter((k) => show(k) && !STAT_KEYS.includes(k));

  const bodies = {
    totalTenants: (
      <Link to="/tenants" className="block transition-transform hover:-translate-y-0.5">
        <StatCard
          title={t("totalTenants", language)}
          value={formatNumber(stats.totalTenants || 0, language)}
          change={`${stats.newTenantsThisMonth || 0} ${t("thisMonth", language)}`}
          icon={BuildingOfficeIcon}
          trend="up"
        />
      </Link>
    ),
    activeTenants: (
      <Link to="/tenants?status=active" className="block transition-transform hover:-translate-y-0.5">
        <StatCard
          title={t("activeTenants", language)}
          value={formatNumber(stats.activeTenants || 0, language)}
          subtitle={`${
            stats.totalTenants > 0
              ? ((stats.activeTenants / stats.totalTenants) * 100).toFixed(1)
              : 0
          }% ${t("ofTotal", language)}`}
          icon={UsersIcon}
        />
      </Link>
    ),
    monthlyRevenue: (
      <Link to="/billing" className="block transition-transform hover:-translate-y-0.5">
        <StatCard
          title={t("monthlyRevenue", language)}
          value={formatCurrency(stats.monthlyRecurring || 0, "USD", language)}
          icon={BanknoteIcon}
        />
      </Link>
    ),
    totalPatients: (
      <Link to="/analytics" className="block transition-transform hover:-translate-y-0.5">
        <StatCard
          title={t("totalPatients", language)}
          value={formatNumber(stats.totalPatients || 0, language)}
          subtitle={t("acrossAllTenants", language)}
          icon={ChartBarIcon}
        />
      </Link>
    ),
    revenueOverview: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {t("revenueOverview", language)}
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("totalRevenue", language)}
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(stats.totalRevenue || 0, "USD", language)}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("monthlyRecurring", language)}
            </span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.monthlyRecurring || 0, "USD", language)}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("churnRate", language)}
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {(stats.churnRate || 0).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("arpa", language)}
            </span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.arpa || 0, "USD", language)}
            </span>
          </div>
        </div>
      </Card>
    ),
    platformStatistics: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {t("platformStatistics", language)}
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("totalAppointments", language)}
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(stats.totalAppointments || 0, language)}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("newTenantsThisMonth", language)}
            </span>
            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.newTenantsThisMonth || 0}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300">
              {t("totalPatients", language)}
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(stats.totalPatients || 0, language)}
            </span>
          </div>
        </div>
      </Card>
    ),
    planDistribution: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {t("cardPlanDistribution", language)}
        </h3>
        {distLoading ? (
          <p className="text-sm text-slate-500">{t("loading", language)}</p>
        ) : distribution.total === 0 ? (
          <p className="text-sm text-slate-500">{t("noData", language)}</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(distribution.byPlan)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count], i) => (
                <DistBar
                  key={key}
                  label={planName(key)}
                  count={count}
                  total={distribution.total}
                  color={PLAN_COLORS[i % PLAN_COLORS.length]}
                />
              ))}
          </div>
        )}
      </Card>
    ),
    statusDistribution: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {t("cardStatusDistribution", language)}
        </h3>
        {distLoading ? (
          <p className="text-sm text-slate-500">{t("loading", language)}</p>
        ) : distribution.total === 0 ? (
          <p className="text-sm text-slate-500">{t("noData", language)}</p>
        ) : (
          <div className="space-y-3">
            {STATUS_ORDER.filter((s) => distribution.byStatus[s]).map((s) => (
              <DistBar
                key={s}
                label={statusLabel(s)}
                count={distribution.byStatus[s]}
                total={distribution.total}
                color={STATUS_COLORS[s]}
              />
            ))}
          </div>
        )}
      </Card>
    ),
    recentAlerts: (
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-amber-500" />
            {t("recentAlertsTitle", language)}
          </h3>
          <Link
            to="/alerts"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {t("viewAll", language)}
          </Link>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("recentAlertsDesc", language)}
        </p>
        {!activeAlerts || activeAlerts.length === 0 ? (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-emerald-500" />
            {t("noActiveAlerts", language)}
          </p>
        ) : (
          <ul className="space-y-2">
            {activeAlerts.slice(0, 5).map((a) => (
              <li
                key={a._id}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEVERITY_DOT[a.severity] || "bg-slate-400"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {a.title || a.type}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {a.tenantName || a.message || a.severity}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    monthlyComparison: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          {t("monthlyComparisonTitle", language)}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("monthlyComparisonDesc", language)}
        </p>
        <div className="space-y-4">
          <CmpRow label={t("totalTenants", language)} data={tenantCmp} />
          <CmpRow label={t("revenue", language)} data={revenueCmp} money />
          <CmpRow label={t("patients", language)} data={patientCmp} />
        </div>
      </Card>
    ),
    atRisk: (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          {t("cardAtRisk", language)}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("atRiskDesc", language)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/tenants?trialExpiring=7"
            className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg transition-transform hover:-translate-y-0.5"
          >
            <span className="text-amber-800 dark:text-amber-200 font-medium">
              {t("trialsEnding", language)}
            </span>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {atRisk.trials}
            </span>
          </Link>
          <Link
            to="/tenants?dormant=true"
            className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg transition-transform hover:-translate-y-0.5"
          >
            <span className="text-slate-700 dark:text-slate-200 font-medium">
              {t("dormantOnly", language)}
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {atRisk.dormant}
            </span>
          </Link>
        </div>
      </Card>
    ),
  };

  const flowRows = [];
  {
    let buf = [];
    orderedFlow.forEach((k) => {
      if (FULL_KEYS.includes(k)) {
        if (buf.length > 0) {
          flowRows.push(buf);
          buf = [];
        }
        flowRows.push([k]);
      } else {
        buf.push(k);
        if (buf.length === 2) {
          flowRows.push(buf);
          buf = [];
        }
      }
    });
    if (buf.length > 0) flowRows.push(buf);
  }

  return (
    <div className="p-6">
      <PageHeader
        title={t("dashboard", language)}
        subtitle={t("dashboardDesc", language)}
        actions={
          <Button variant="outline" icon={CogIcon} onClick={() => setCustomizing(true)} className="tour-customize">
            {t("customize", language)}
          </Button>
        }
      />

      {orderedStats.length > 0 && (
        <div className="tour-stats grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {orderedStats.map((k) => (
            <Fragment key={k}>{bodies[k]}</Fragment>
          ))}
        </div>
      )}

      {flowRows.map((row, i) =>
        row.length === 2 || FULL_KEYS.includes(row[0]) ? (
          <div key={row.join("+")} className={i === 0 && orderedStats.length === 0 ? "" : "mt-6"}>
            {row.length === 2 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {row.map((k) => (
                  <Fragment key={k}>{bodies[k]}</Fragment>
                ))}
              </div>
            ) : (
              bodies[row[0]]
            )}
          </div>
        ) : (
          <div key={row.join("+")} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Fragment key={row[0]}>{bodies[row[0]]}</Fragment>
          </div>
        ),
      )}

      <Modal
        isOpen={customizing}
        onClose={() => setCustomizing(false)}
        title={t("customizeDashboard", language)}
        size="md"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("customizeDashboardDesc", language)}
        </p>
        <div className="space-y-2">
          {modalKeys.map((key) => {
            const card = CARDS.find((c) => c.key === key);
            if (!card) return null;
            return (
              <div
                key={key}
                draggable
                onDragStart={() => {
                  dragKey.current = key;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragKey.current) moveCard(dragKey.current, key);
                  dragKey.current = null;
                }}
                onDragEnd={() => {
                  dragKey.current = null;
                }}
                className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span
                  className="cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  title={t("dragToReorder", language)}
                >
                  <Bars3Icon className="w-5 h-5" />
                </span>
                <label className="flex flex-1 items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {t(card.titleKey, language)}
                  </span>
                  <input
                    type="checkbox"
                    checked={layout.enabled.includes(key)}
                    onChange={() => toggleCard(key)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-6">
          <Button variant="ghost" size="sm" onClick={resetCards}>
            {t("resetDefaults", language)}
          </Button>
          <Button onClick={() => setCustomizing(false)} size="sm">
            {t("done", language)}
          </Button>
        </div>
      </Modal>

      {tourOpen && <DashboardTour onDone={() => setTourOpen(false)} />}
    </div>
  );
}
