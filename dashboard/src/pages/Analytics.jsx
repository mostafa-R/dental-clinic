import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import { ArrowDownTrayIcon, BanknoteIcon, BuildingOfficeIcon, ChartBarIcon, HeartIcon, UsersIcon } from "../components/ui/icons";
import {
  fetchGlobalStats,
  fetchGrowthData,
  fetchRevenueByPlan,
} from "../features/analytics/analyticsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import { formatNumber, formatCurrency } from "../lib/format";
import { downloadCsv } from "../lib/exportCsv";
import { t } from "../lib/i18n";

const chartColors = { stroke: "#6366f1", fill: "#6366f1", grid: "#e2e8f0" };

export default function Analytics() {
  const dispatch = useDispatch();
  const { stats, growthData, revenueByPlan, loading } = useSelector(
    (state) => state.analytics,
  );
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const [period, setPeriod] = useState("6months");

  useEffect(() => {
    dispatch(fetchGlobalStats());
    dispatch(fetchGrowthData(period));
    dispatch(fetchRevenueByPlan());
    dispatch(fetchPlans());
  }, [dispatch, period]);

  if (loading && !stats.totalTenants) {
    return <PageLoader />;
  }

  const planName = (key) => plans.find((p) => p.key === key)?.name || key;

  const exportPlans = () => {
    downloadCsv({
      filename: t("exportPlansFile", language),
      rows: revenueByPlan || [],
      headers: [
        { label: t("plan", language), getValue: (r) => planName(r.plan) },
        { label: t("subscribers", language), getValue: (r) => r.count },
        { label: t("monthlyRecurring", language), getValue: (r) => r.mrr },
      ],
    });
  };

  const exportGrowth = () => {
    const rows = (growthData.tenants || []).map((p) => {
      const revenue = (growthData.revenue || []).find((r) => r.month === p.month);
      const patients = (growthData.patients || []).find((r) => r.month === p.month);
      return {
        month: p.month,
        tenants: p.count,
        patients: patients?.count || 0,
        revenue: revenue?.count || 0,
      };
    });
    downloadCsv({
      filename: t("exportGrowth", language),
      rows,
      headers: [
        { label: t("month", language), getValue: (r) => r.month },
        { label: t("totalTenants", language), getValue: (r) => r.tenants },
        { label: t("patients", language), getValue: (r) => r.patients },
        { label: t("revenue", language), getValue: (r) => r.revenue },
      ],
    });
  };

  return (
    <div className="p-6">
      <PageHeader
        title={t("analytics", language)}
        subtitle={t("analyticsDesc", language)}
        actions={
          <Button variant="outline" onClick={exportGrowth} icon={ArrowDownTrayIcon}>
            {t("exportCsv", language)}
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        {["30days", "6months", "12months"].map((p) => (
          <Button
            key={p}
            variant={period === p ? "primary" : "secondary"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "30days" ? t("days30", language) : p === "6months" ? t("months6", language) : t("months12", language)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={t("totalTenants", language)}
          value={formatNumber(stats.totalTenants || 0, language)}
          change={`${stats.newTenantsThisMonth || 0} ${t("thisMonth", language)}`}
          icon={BuildingOfficeIcon}
          trend="up"
        />
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
        <StatCard
          title={t("monthlyRecurring", language)}
          value={formatCurrency(stats.monthlyRecurring || 0, "USD", language)}
          subtitle={t("arpa", language) + ": " + formatCurrency(stats.arpa || 0, "USD", language)}
          icon={BanknoteIcon}
        />
        <StatCard
          title={t("totalRevenue", language)}
          value={formatCurrency(stats.totalRevenue || 0, "USD", language)}
          subtitle={t("churnRate", language) + ": " + (stats.churnRate || 0).toFixed(1) + "%"}
          icon={ChartBarIcon}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("tenantGrowth", language)}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData.tenants || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={chartColors.stroke} strokeWidth={2} dot={{ fill: chartColors.fill }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            {t("dataPoints", { count: growthData.tenants?.length || 0 }, language)}
          </p>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("patientGrowth", language)}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData.patients || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#34d399" strokeWidth={2} dot={{ fill: "#34d399" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            {t("dataPoints", { count: growthData.patients?.length || 0 }, language)}
          </p>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("revenueGrowth", language)}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData.revenue || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value, "USD", language)} />
                <Bar dataKey="count" fill={chartColors.fill} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            {t("dataPoints", { count: growthData.revenue?.length || 0 }, language)}
          </p>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("platformOverview", language)}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-center">
              <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {stats.totalTenants || 0}
              </p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">
                {t("totalTenants", language)}
              </p>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.activeTenants || 0}
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                {t("activeTenants", language)}
              </p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                {stats.newTenantsThisMonth || 0}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {t("newTenantsThisMonth", language)}
              </p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {(stats.churnRate || 0).toFixed(1)}%
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {t("churnRate", language)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("revenueByPlanTitle", language)}
            </h3>
            <Button variant="outline" size="sm" onClick={exportPlans} icon={ArrowDownTrayIcon}>
              {t("exportCsv", language)}
            </Button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t("revenueByPlanDesc", language)}
          </p>
          {!revenueByPlan || revenueByPlan.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noData", language)}</p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByPlan.map((r) => ({ ...r, name: planName(r.plan) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatCurrency(value, "USD", language)} />
                    <Bar dataKey="mrr" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-700/50">
                {revenueByPlan.map((r) => (
                  <li key={r.plan} className="py-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {planName(r.plan)}
                      <span className="ms-2 font-normal text-slate-400">
                        {r.count} {t("subscribers", language)}
                      </span>
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.mrr || 0, "USD", language)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("statistics", language)}
          </h3>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg mb-4">
            <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <HeartIcon className="w-5 h-5 text-emerald-500" />
              {t("totalPatientsLabel", language)}
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatNumber(stats.totalPatients || 0, language)}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5 text-indigo-500" />
              {t("totalAppointmentsLabel", language)}
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatNumber(stats.totalAppointments || 0, language)}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}