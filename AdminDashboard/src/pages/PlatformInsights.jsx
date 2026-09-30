import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import Badge from "../components/ui/Badge";
import {
  BanknoteIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  HeartIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersIcon,
} from "../components/ui/icons";
import {
  fetchAppointmentAnalytics,
  fetchBackgroundJobs,
  fetchDoctorPerformance,
  fetchFinancialAnalytics,
  fetchInventoryAnalytics,
  fetchPatientAnalytics,
  fetchPlatformOverview,
  fetchSaaSBillingAnalytics,
  fetchSecurityMonitoring,
  fetchSiteRoles,
  fetchSystemActivity,
  fetchTreatmentAnalytics,
  fetchUsageAnalytics,
} from "../features/platformAnalytics/platformAnalyticsSlice";
import { formatCurrency, formatNumber } from "../lib/format";
import { downloadCsv } from "../lib/exportCsv";
import { canUserAccess } from "../lib/permissions";
import { t } from "../lib/i18n";

/**
 * Each tab declares the site-access key that mirrors the server's
 * `requireSitePermission(...)` gate for the endpoint it loads, so a role that
 * cannot read a section never renders a tab that would only 403.
 */
const TABS = [
  { id: "overview", labelKey: "platformOverview", accessKey: "platformInsights.overview", load: fetchPlatformOverview, perm: "overview" },
  { id: "financial", labelKey: "financial", accessKey: "platformInsights.financial", load: fetchFinancialAnalytics, perm: "financial" },
  { id: "patients", labelKey: "patients", accessKey: "platformInsights.patients", load: fetchPatientAnalytics, perm: "patients" },
  { id: "appointments", labelKey: "appointments", accessKey: "platformInsights.appointments", load: fetchAppointmentAnalytics, perm: "appointments" },
  { id: "doctors", labelKey: "doctors", accessKey: "platformInsights.doctors", load: fetchDoctorPerformance, perm: "doctors" },
  { id: "treatments", labelKey: "treatments", accessKey: "platformInsights.treatments", load: fetchTreatmentAnalytics, perm: "treatments" },
  { id: "inventory", labelKey: "inventory", accessKey: "platformInsights.inventory", load: fetchInventoryAnalytics, perm: "inventory" },
  { id: "billing", labelKey: "billing", accessKey: "platformInsights.billing", load: fetchSaaSBillingAnalytics, perm: "saasBilling" },
  { id: "usage", labelKey: "usage", accessKey: "platformInsights.usage", load: fetchUsageAnalytics, perm: "usage" },
  { id: "activity", labelKey: "activity", accessKey: "platformInsights.activity", load: fetchSystemActivity, perm: "activity" },
  { id: "jobs", labelKey: "jobs", accessKey: "platformInsights.jobs", load: fetchBackgroundJobs, perm: "jobs" },
  { id: "security", labelKey: "security", accessKey: "platformInsights.security", load: fetchSecurityMonitoring, perm: "security" },
  { id: "roles", labelKey: "siteAdmins", accessKey: "platformInsights.roles", load: fetchSiteRoles, perm: "roles" },
];

const ROLE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function SectionError({ error }) {
  const isForbidden = error?.status === 403;
  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-700/40 rounded-lg text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {isForbidden ? t("noPermissionForSection", "en") : t("failedToLoad", "en")}
      </p>
      {error?.message && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{error.message}</p>
      )}
    </div>
  );
}

function Panel({ loading, error, children, title, action }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        {action}
      </div>
      {loading ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          {t("loading", "en")}
        </div>
      ) : error ? (
        <SectionError error={error} />
      ) : (
        children
      )}
    </Card>
  );
}

function BreakdownTable({ columns, rows, emptyKey = "noData" }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-slate-500">{t(emptyKey, "en")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="text-start font-semibold text-slate-600 dark:text-slate-300 py-2 pe-3"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row._id || row.name || i}
              className="border-b border-slate-100 dark:border-slate-700/50"
            >
              {columns.map((c) => (
                <td key={c.key} className="py-2 pe-3 text-slate-700 dark:text-slate-200">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewSection({ loading, error, data, language }) {
  if (loading || error || !data) {
    return <Panel loading={loading} error={error} title={t("platformOverview", language)} />;
  }
  const { tenants, users, healthcare, financial, inventory, subscriptions, system } = data;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard title={t("totalTenants", language)} value={formatNumber(tenants.total, language)} subtitle={`${formatNumber(tenants.active, language)} ${t("activeTenants", language)}`} icon={BuildingOfficeIcon} />
        <StatCard title={t("monthlyRecurring", language)} value={formatCurrency(subscriptions.mrr, "USD", language)} subtitle={`ARR ${formatCurrency(subscriptions.arr, "USD", language)}`} icon={BanknoteIcon} variant="success" />
        <StatCard title={t("patients", language)} value={formatNumber(healthcare.patients.totalActive, language)} subtitle={`${formatNumber(healthcare.appointments.today, language)} ${t("today", language)}`} icon={HeartIcon} variant="info" />
        <StatCard title={t("totalRevenue", language)} value={formatCurrency(financial.revenue.total, "USD", language)} subtitle={`${t("thisMonth", language)}: ${formatCurrency(financial.revenue.thisMonth, "USD", language)}`} icon={ChartBarIcon} variant="warning" />
        <StatCard title={t("users", language)} value={formatNumber(users.total, language)} subtitle={`${formatNumber(users.doctors, language)} ${t("doctors", language)}`} icon={UsersIcon} variant="neutral" />
        <StatCard title={t("branches", language)} value={formatNumber(healthcare.branches, language)} subtitle={`${formatNumber(users.active, language)} ${t("activeTenants", language)}`} icon={BuildingOfficeIcon} variant="neutral" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title={t("tenantBreakdown", language)} loading={loading}>
          <BreakdownTable
            rows={[
              { name: t("statusActive", language), _id: "active", count: tenants.active },
              { name: t("statusTrial", language), _id: "trial", count: tenants.trial },
              { name: t("statusSuspended", language), _id: "suspended", count: tenants.suspended },
              { name: t("statusCancelled", language), _id: "cancelled", count: tenants.cancelled },
              { name: t("statusArchived", language), _id: "archived", count: tenants.archived },
            ]}
            columns={[
              { key: "name", label: t("status", language), render: (r) => r.name },
              { key: "count", label: t("tenants", language), render: (r) => formatNumber(r.count, language) },
            ]}
          />
        </Panel>
        <Panel title={t("financialSummary", language)} loading={loading}>
          <dl className="space-y-3 text-sm">
            {[
              [t("revenue", language), financial.revenue.total],
              [t("expenses", language), financial.expenses.total],
              [t("paymentsCollected", language), financial.payments.collected],
              [t("refunds", language), financial.refunds.total],
              [t("commissions", language), financial.commissions.total],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(value, "USD", language)}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={t("systemHealth", language)} loading={loading}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("healthStatus", language)}</dt>
              <dd>
                <Badge variant={system.health.status === "healthy" ? "success" : system.health.status === "degraded" ? "warning" : "danger"}>
                  {system.health.status || "unknown"}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("lowStock", language)}</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">{formatNumber(inventory.lowStock, language)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("errors", language)}</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">{formatNumber(system.errors.unresolved, language)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("storageUsed", language)}</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {formatNumber(system.storage.estimatedUsedMB, language)} MB
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}

export default function PlatformInsights() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { language, theme } = useSelector((state) => state.ui);
  const sections = useSelector((state) => state.platformAnalytics);
  const [tab, setTab] = useState("overview");

  const dark = theme === "dark";
  const chartColors = dark
    ? { stroke: "#818cf8", fill: "#818cf8", grid: "#334155", tick: "#94a3b8" }
    : { stroke: "#6366f1", fill: "#6366f1", grid: "#e2e8f0", tick: "#64748b" };
  const tooltipStyle = dark
    ? { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }
    : undefined;

  const availableTabs = useMemo(
    () => TABS.filter((t) => canUserAccess(user, t.accessKey)),
    [user],
  );

  const active = useMemo(
    () => availableTabs.find((t) => t.id === tab) || availableTabs[0],
    [availableTabs, tab],
  );

  useEffect(() => {
    if (active) dispatch(active.load());
  }, [dispatch, active]);

  if (availableTabs.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title={t("noPermission", language)} description={t("noPermissionDesc", language)} />
      </div>
    );
  }

  if (!sections.loading.overview && !sections.overview && !active) {
    return <PageLoader />;
  }

  const renderSection = () => {
    const perm = active?.perm;
    const loading = !!sections.loading[perm];
    const error = sections.error[perm] || null;
    const data = sections[perm];
    const L = (k) => t(k, language);

    switch (perm) {
      case "overview":
        return <OverviewSection loading={loading} error={error} data={data} language={language} />;

      case "financial":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title={L("revenueByMonth")} loading={loading} error={error}>
              {data?.revenue?.byMonth?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.revenue.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <YAxis tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v, "USD", language)} />
                      <Line type="monotone" dataKey="revenue" stroke={chartColors.stroke} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{L("noData")}</p>
              )}
            </Panel>
            <Panel title={L("revenueByService")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.revenue?.byService}
                columns={[
                  { key: "service", label: L("service"), render: (r) => r.service || "—" },
                  { key: "units", label: L("units"), render: (r) => formatNumber(r.units, language) },
                  { key: "revenue", label: L("revenue"), render: (r) => formatCurrency(r.revenue, "USD", language) },
                ]}
              />
            </Panel>
            <Panel title={L("paymentsByMethod")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.payments?.byMethod}
                columns={[
                  { key: "method", label: L("method"), render: (r) => r._id || "—" },
                  { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                  { key: "total", label: L("total"), render: (r) => formatCurrency(r.total, "USD", language) },
                ]}
              />
            </Panel>
            <Panel title={L("expensesByCategory")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.expenses?.byCategory}
                columns={[
                  { key: "category", label: L("category"), render: (r) => r._id || "—" },
                  { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                  { key: "total", label: L("total"), render: (r) => formatCurrency(r.total, "USD", language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "patients":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-2">
              <StatCard title={L("totalPatientsLabel")} value={formatNumber(data?.summary?.total, language)} icon={UsersIcon} />
              <StatCard title={L("activePatients")} value={formatNumber(data?.summary?.active, language)} icon={HeartIcon} variant="info" />
              <StatCard title={L("newLast30")} value={formatNumber(data?.summary?.newThirtyDays, language)} icon={ChartBarIcon} variant="success" />
              <StatCard title={L("avgVisits")} value={formatNumber(data?.summary?.avgVisits, language)} icon={UserCircleIcon} variant="warning" />
            </div>
            <Panel title={L("byAgeGroup")} loading={loading} error={error}>
              {data?.byAgeGroup?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byAgeGroup}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="_id" tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <YAxis tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="patients" fill={chartColors.fill} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{L("noData")}</p>
              )}
            </Panel>
            <Panel title={L("byTenant")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.byTenant}
                columns={[
                  { key: "name", label: L("tenant"), render: (r) => r.name },
                  { key: "patients", label: L("patients"), render: (r) => formatNumber(r.patients, language) },
                  { key: "appointments", label: L("appointments"), render: (r) => formatNumber(r.appointments, language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "appointments":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-2">
              <StatCard title={L("totalAppointmentsLabel")} value={formatNumber(data?.summary?.total, language)} icon={ChartBarIcon} />
              <StatCard title={L("today")} value={formatNumber(data?.summary?.today, language)} icon={HeartIcon} variant="info" />
              <StatCard title={L("upcoming")} value={formatNumber(data?.summary?.upcoming, language)} icon={UsersIcon} variant="success" />
              <StatCard title={L("noShowRate")} value={`${formatNumber(data?.summary?.noShowRate, language)}%`} icon={ChartBarIcon} variant="danger" />
            </div>
            <Panel title={L("appointmentsByMonth")} loading={loading} error={error}>
              {data?.byMonth?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <YAxis tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="appointments" stroke={chartColors.stroke} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{L("noData")}</p>
              )}
            </Panel>
            <Panel title={L("byDoctor")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.byDoctor}
                columns={[
                  { key: "name", label: L("doctor"), render: (r) => r.name },
                  { key: "appointments", label: L("appointments"), render: (r) => formatNumber(r.appointments, language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "doctors": {
        const rows = data?.doctors || [];
        const exportDoctors = () =>
          downloadCsv({
            filename: L("exportDoctors"),
            rows,
            headers: [
              { label: L("doctor"), getValue: (r) => r.name },
              { label: L("appointments"), getValue: (r) => r.appointments },
              { label: L("completed"), getValue: (r) => r.completed },
              { label: L("completionRate"), getValue: (r) => r.completionRate },
              { label: L("noShowRate"), getValue: (r) => r.noShowRate },
            ],
          });
        return (
          <Panel
            title={L("doctorPerformance")}
            loading={loading}
            error={error}
            action={
              <span className="text-sm text-slate-500">
                {formatNumber(data?.summary?.doctors, language)} {L("doctors")}
              </span>
            }
          >
            <BreakdownTable
              rows={rows}
              emptyKey={L("noData")}
              columns={[
                { key: "name", label: L("doctor"), render: (r) => r.name },
                { key: "branch", label: L("branch"), render: (r) => r.branch || "—" },
                { key: "appointments", label: L("appointments"), render: (r) => formatNumber(r.appointments, language) },
                { key: "completionRate", label: L("completionRate"), render: (r) => `${formatNumber(r.completionRate, language)}%` },
                { key: "noShowRate", label: L("noShowRate"), render: (r) => `${formatNumber(r.noShowRate, language)}%` },
                { key: "commissions", label: L("commissions"), render: (r) => formatCurrency(r.commissions.earned, "USD", language) },
              ]}
            />
            {rows.length > 0 && (
              <button
                type="button"
                onClick={exportDoctors}
                className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {L("exportCsv")}
              </button>
            )}
          </Panel>
        );
      }

      case "treatments":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-2">
              <StatCard title={L("treatmentPlans")} value={formatNumber(data?.summary?.total, language)} icon={ChartBarIcon} />
              <StatCard title={L("completed")} value={formatNumber(data?.summary?.completedItems, language)} icon={HeartIcon} variant="success" />
              <StatCard title={L("estimatedRevenue")} value={formatCurrency(data?.summary?.estimatedRevenue, "USD", language)} icon={BanknoteIcon} variant="warning" />
              <StatCard title={L("completedRevenue")} value={formatCurrency(data?.summary?.completedRevenue, "USD", language)} icon={BanknoteIcon} variant="info" />
            </div>
            <Panel title={L("mostCommonProcedures")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.mostCommonProcedures}
                columns={[
                  { key: "procedure", label: L("procedure"), render: (r) => r.procedure || "—" },
                  { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                  { key: "estimated", label: L("revenue"), render: (r) => formatCurrency(r.estimated, "USD", language) },
                ]}
              />
            </Panel>
            <Panel title={L("plansByStatus")} loading={loading} error={error}>
              <BreakdownTable
                rows={Object.entries(data?.summary?.byStatus || {}).map(([status, count]) => ({
                  _id: status,
                  name: status,
                  count,
                }))}
                columns={[
                  { key: "name", label: L("status"), render: (r) => r.name },
                  { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "inventory":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-2">
              <StatCard title={L("inventoryItems")} value={formatNumber(data?.summary?.items, language)} icon={BuildingOfficeIcon} />
              <StatCard title={L("inventoryValue")} value={formatCurrency(data?.summary?.inventoryValue, "USD", language)} icon={BanknoteIcon} variant="success" />
              <StatCard title={L("lowStock")} value={formatNumber(data?.summary?.lowStock, language)} icon={ChartBarIcon} variant="warning" />
              <StatCard title={L("outOfStock")} value={formatNumber(data?.summary?.outOfStock, language)} icon={ChartBarIcon} variant="danger" />
            </div>
            <Panel title={L("byCategory")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.byCategory}
                columns={[
                  { key: "category", label: L("category"), render: (r) => r._id || "—" },
                  { key: "items", label: L("items"), render: (r) => formatNumber(r.items, language) },
                  { key: "value", label: L("value"), render: (r) => formatCurrency(r.value, "USD", language) },
                ]}
              />
            </Panel>
            <Panel title={L("byTenant")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.byTenant}
                columns={[
                  { key: "name", label: L("tenant"), render: (r) => r.name },
                  { key: "items", label: L("items"), render: (r) => formatNumber(r.items, language) },
                  { key: "value", label: L("value"), render: (r) => formatCurrency(r.value, "USD", language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "saasBilling":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-2">
              <StatCard title={L("monthlyRecurring")} value={formatCurrency(data?.summary?.mrr, "USD", language)} icon={BanknoteIcon} variant="success" />
              <StatCard title={L("arr")} value={formatCurrency(data?.summary?.arr, "USD", language)} icon={BanknoteIcon} variant="info" />
              <StatCard title={L("churnRate")} value={`${formatNumber(data?.summary?.churnRate, language)}%`} icon={ChartBarIcon} variant="danger" />
              <StatCard title={L("activeSubscriptions")} value={formatNumber(data?.summary?.active, language)} icon={UsersIcon} variant="warning" />
            </div>
            <Panel title={L("revenueByPlanTitle")} loading={loading} error={error}>
              {data?.revenueByPlan?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revenueByPlan}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="plan" tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <YAxis tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v, "USD", language)} />
                      <Bar dataKey="revenue" fill={chartColors.fill} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{L("noData")}</p>
              )}
            </Panel>
            <Panel title={L("renewalsUpcoming")} loading={loading} error={error}>
              <BreakdownTable
                rows={data?.renewalsUpcoming}
                columns={[
                  { key: "tenantName", label: L("tenant"), render: (r) => r.tenantName },
                  { key: "plan", label: L("plan"), render: (r) => r.plan || "—" },
                  { key: "amount", label: L("amount"), render: (r) => formatCurrency(r.amount, "USD", language) },
                ]}
              />
            </Panel>
          </div>
        );

      case "usage": {
        const byPlan = data?.byPlan || [];
        const exportUsage = () =>
          downloadCsv({
            filename: L("exportUsage"),
            rows: data?.byTenant || [],
            headers: [
              { label: L("tenant"), getValue: (r) => r.name },
              { label: L("users"), getValue: (r) => r.usage?.users },
              { label: L("doctors"), getValue: (r) => r.usage?.doctors },
              { label: L("patients"), getValue: (r) => r.usage?.patients },
              { label: L("storage"), getValue: (r) => r.usage?.storageMB },
            ],
          });
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title={L("usageByPlan")} loading={loading} error={error}>
              {byPlan.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byPlan}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="plan" tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <YAxis tick={{ fontSize: 12, fill: chartColors.tick }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="patients" fill={chartColors.fill} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{L("noData")}</p>
              )}
            </Panel>
            <Panel
              title={L("usageByTenant")}
              loading={loading}
              error={error}
              action={
                (data?.byTenant?.length || 0) > 0 ? (
                  <button
                    type="button"
                    onClick={exportUsage}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {L("exportCsv")}
                  </button>
                ) : null
              }
            >
              <BreakdownTable
                rows={data?.byTenant}
                columns={[
                  { key: "name", label: L("tenant"), render: (r) => r.name },
                  { key: "users", label: L("users"), render: (r) => formatNumber(r.usage?.users, language) },
                  { key: "doctors", label: L("doctors"), render: (r) => formatNumber(r.usage?.doctors, language) },
                  { key: "patients", label: L("patients"), render: (r) => formatNumber(r.usage?.patients, language) },
                ]}
              />
            </Panel>
          </div>
        );
      }

      case "activity":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title={L("performance")} loading={loading} error={error}>
              <dl className="space-y-3 text-sm">
                {[
                  [L("totalRequests"), data?.performance?.totalRequests],
                  [L("avgResponseTime"), data?.performance?.avgResponseMs ? `${formatNumber(data.performance.avgResponseMs, language)} ms` : null],
                  [L("errorRate"), `${formatNumber(data?.performance?.errorRate, language)}%`],
                  [L("routesUnder200ms"), data?.performance?.routesUnder200ms],
                  [L("onlineNow"), data?.onlineSockets],
                  [L("uptime"), data?.uptime ? `${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m` : null],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">
                      {value ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title={L("errors")} loading={loading} error={error}>
              <dl className="space-y-3 text-sm">
                {[
                  [L("today"), data?.errors?.today],
                  [L("last30Days"), data?.errors?.thirtyDays],
                  [L("unresolved"), data?.errors?.unresolved],
                  [L("auditActivityToday"), data?.auditActivityToday],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">
                      {formatNumber(value, language)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        );

      case "jobs": {
        const jobs = data?.jobs || [];
        return (
          <Panel
            title={L("backgroundJobs")}
            loading={loading}
            error={error}
            action={
              <span className="text-sm text-slate-500">
                {jobs.filter((j) => j.running).length} {L("running")}
              </span>
            }
          >
            <BreakdownTable
              rows={jobs}
              emptyKey={L("noData")}
              columns={[
                { key: "key", label: L("job"), render: (r) => r.key || r.name || "—" },
                { key: "running", label: L("status"), render: (r) => (
                  <Badge variant={r.running ? "success" : "default"}>
                    {r.running ? L("running") : L("idle")}
                  </Badge>
                ) },
                { key: "expiresAt", label: L("lockExpires"), render: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleString(language) : "—") },
              ]}
            />
          </Panel>
        );
      }

      case "security": {
        const chain = data?.auditChain;
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <StatCard title={L("siteAdmins")} value={formatNumber(data?.summary?.siteAdmins, language)} icon={ShieldCheckIcon} />
              <StatCard title={L("twoFactorEnabled")} value={formatNumber(data?.summary?.twoFactorEnabled, language)} icon={ShieldCheckIcon} variant="success" />
              <StatCard title={L("twoFactorNotEnabled")} value={formatNumber(data?.summary?.twoFactorNotEnabled, language)} icon={ShieldCheckIcon} variant="warning" />
              <StatCard title={L("securityEvents30d")} value={formatNumber(data?.summary?.securityEventsLast30Days, language)} icon={ChartBarIcon} variant="danger" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={L("auditChain")} loading={loading} error={error}>
                <div className="flex items-center gap-3">
                  <Badge variant={chain?.valid === true ? "success" : chain?.valid === false ? "danger" : "default"}>
                    {chain?.valid === true ? L("chainValid") : chain?.valid === false ? L("chainInvalid") : L("unknown")}
                  </Badge>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {formatNumber(chain?.checked, language)} {L("recordsChecked")}
                  </span>
                </div>
                {chain?.errors?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400">
                    {chain.errors.map((e, i) => (
                      <li key={i}>{String(e)}</li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title={L("impersonation")} loading={loading} error={error}>
                <BreakdownTable
                  rows={data?.impersonation}
                  columns={[
                    { key: "action", label: L("action"), render: (r) => r.action },
                    { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                  ]}
                />
              </Panel>
              <Panel title={L("securityEvents")} loading={loading} error={error}>
                <BreakdownTable
                  rows={data?.securityEvents}
                  columns={[
                    { key: "action", label: L("action"), render: (r) => r.action },
                    { key: "count", label: L("count"), render: (r) => formatNumber(r.count, language) },
                  ]}
                />
              </Panel>
              <Panel title={L("admin2faByRole")} loading={loading} error={error}>
                <div className="h-64">
                  {data?.admin2fa?.byRole?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.admin2fa.byRole.map((r) => ({
                            name: r._id,
                            value: r.count,
                          }))}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={80}
                        >
                          {data.admin2fa.byRole.map((r, i) => (
                            <Cell key={r._id} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-500">{L("noData")}</p>
                  )}
                </div>
              </Panel>
            </div>
          </>
        );
      }

      case "roles":
        return (
          <Panel title={L("siteAdmins")} loading={loading} error={error}>
            <BreakdownTable
              emptyKey="noData"
              rows={data || []}
              columns={[
                { key: "key", label: L("constant") },
                {
                  key: "value",
                  label: L("role"),
                  render: (r) => <Badge variant="info">{r.value}</Badge>,
                },
              ]}
            />
          </Panel>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title={t("platformInsights", language)}
        subtitle={t("platformInsightsDesc", language)}
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {availableTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={active?.id === item.id ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active?.id === item.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t(item.labelKey, language)}
          </button>
        ))}
      </div>

      {renderSection()}
    </div>
  );
}
