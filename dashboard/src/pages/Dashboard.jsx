import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import {
  BanknoteIcon,
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

const DEFAULT_ENABLED = CARDS.map((c) => c.key);

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

function loadEnabled() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ENABLED;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return CARDS.map((c) => c.key).filter((k) => parsed.includes(k));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ENABLED;
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const { stats, growthData, loading } = useSelector((state) => state.analytics);
  const { active: activeAlerts } = useSelector((state) => state.alerts);
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const [enabled, setEnabled] = useState(loadEnabled);
  const [customizing, setCustomizing] = useState(false);
  const [distribution, setDistribution] = useState({ byPlan: {}, byStatus: {}, total: 0 });
  const [distLoading, setDistLoading] = useState(true);
  const [atRisk, setAtRisk] = useState({ trials: 0, dormant: 0 });

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

  const toggleCard = (key) => {
    setEnabled((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetCards = () => {
    setEnabled(DEFAULT_ENABLED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ENABLED));
  };

  if (loading && !stats.totalTenants) {
    return <PageLoader />;
  }

  const show = (key) => enabled.includes(key);

  return (
    <div className="p-6">
      <PageHeader
        title={t("dashboard", language)}
        subtitle={t("dashboardDesc", language)}
        actions={
          <Button variant="outline" icon={CogIcon} onClick={() => setCustomizing(true)}>
            {t("customize", language)}
          </Button>
        }
      />

      {show("totalTenants") ||
      show("activeTenants") ||
      show("monthlyRevenue") ||
      show("totalPatients") ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {show("totalTenants") && (
            <Link to="/tenants" className="block transition-transform hover:-translate-y-0.5">
              <StatCard
                title={t("totalTenants", language)}
                value={formatNumber(stats.totalTenants || 0, language)}
                change={`${stats.newTenantsThisMonth || 0} ${t("thisMonth", language)}`}
                icon={BuildingOfficeIcon}
                trend="up"
              />
            </Link>
          )}
          {show("activeTenants") && (
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
          )}
          {show("monthlyRevenue") && (
            <Link to="/billing" className="block transition-transform hover:-translate-y-0.5">
              <StatCard
                title={t("monthlyRevenue", language)}
                value={formatCurrency(stats.monthlyRecurring || 0, "USD", language)}
                icon={BanknoteIcon}
              />
            </Link>
          )}
          {show("totalPatients") && (
            <Link to="/analytics" className="block transition-transform hover:-translate-y-0.5">
              <StatCard
                title={t("totalPatients", language)}
                value={formatNumber(stats.totalPatients || 0, language)}
                subtitle={t("acrossAllTenants", language)}
                icon={ChartBarIcon}
              />
            </Link>
          )}
        </div>
      ) : null}

      {(show("revenueOverview") || show("platformStatistics")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {show("revenueOverview") && (
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
          )}

          {show("platformStatistics") && (
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
          )}
        </div>
      )}

      {(show("planDistribution") || show("statusDistribution")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {show("planDistribution") && (
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
          )}

          {show("statusDistribution") && (
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
          )}
        </div>
      )}

      {(show("recentAlerts") || show("monthlyComparison")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {show("recentAlerts") && (
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
          )}

          {show("monthlyComparison") && (
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
          )}
        </div>
      )}

      {show("atRisk") && (
        <div className="mt-6">
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
        </div>
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
          {CARDS.map((card) => (
            <label
              key={card.key}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {t(card.titleKey, language)}
              </span>
              <input
                type="checkbox"
                checked={enabled.includes(card.key)}
                onChange={() => toggleCard(card.key)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          ))}
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
    </div>
  );
}