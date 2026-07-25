import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import Card from "../components/ui/Card";
import { PageLoader } from "../components/ui/Spinner";
import StatCard from "../components/ui/StatCard";
import {
  BanknoteIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  UsersIcon,
} from "../components/ui/icons";
import { fetchGlobalStats } from "../features/analytics/analyticsSlice";
import { formatCurrency, formatNumber } from "../lib/format";
import { t } from "../lib/i18n";

export default function Dashboard() {
  const dispatch = useDispatch();
  const { stats, loading } = useSelector((state) => state.analytics);
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    dispatch(fetchGlobalStats());
  }, [dispatch]);

  if (loading && !stats.totalTenants) {
    return <PageLoader />;
  }

  return (
    <div className="p-6">
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
          title={t("monthlyRevenue", language)}
          value={formatCurrency(stats.monthlyRecurring || 0, "USD", language)}
          icon={BanknoteIcon}
        />
        <StatCard
          title={t("totalPatients", language)}
          value={formatNumber(stats.totalPatients || 0, language)}
          subtitle={t("acrossAllTenants", language)}
          icon={ChartBarIcon}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      </div>
    </div>
  );
}
