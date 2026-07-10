import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { PageLoader } from "../components/ui/Spinner";
import {
  fetchGlobalStats,
  fetchGrowthData,
} from "../features/analytics/analyticsSlice";
import { formatNumber, formatCurrency } from "../lib/format";
import { t } from "../lib/i18n";

const chartColors = { stroke: "#6366f1", fill: "#6366f1", grid: "#e2e8f0" };

export default function Analytics() {
  const dispatch = useDispatch();
  const { stats, growthData, loading } = useSelector(
    (state) => state.analytics,
  );
  const { language } = useSelector((state) => state.ui);
  const [period, setPeriod] = useState("6months");

  useEffect(() => {
    dispatch(fetchGlobalStats());
    dispatch(fetchGrowthData(period));
  }, [dispatch, period]);

  if (loading && !stats.totalTenants) {
    return (
      <AppLayout>
        <Topbar title={t("analytics", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("analytics", language)} />
      <div className="p-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t("tenantGrowth", language)}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthData.tenants || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
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
              {t("revenueGrowth", language)}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthData.revenue || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value, "USD", language)} />
                  <Bar dataKey="amount" fill={chartColors.fill} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
              {t("dataPoints", { count: growthData.revenue?.length || 0 }, language)}
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t("statistics", language)}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className="text-slate-600 dark:text-slate-300">
                  {t("totalPatientsLabel", language)}
                </span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber(stats.totalPatients || 0, language)}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className="text-slate-600 dark:text-slate-300">
                  {t("totalAppointmentsLabel", language)}
                </span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber(stats.totalAppointments || 0, language)}
                </span>
              </div>
            </div>
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
        </div>
      </div>
    </AppLayout>
  );
}
