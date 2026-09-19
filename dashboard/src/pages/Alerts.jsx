import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Pagination from "../components/ui/Pagination";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import { CheckIcon } from "../components/ui/icons";
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  fetchActiveAlerts,
  fetchAlerts,
  fetchAlertSummary,
  resolveAlert,
} from "../features/alerts/alertsSlice";
import { fetchTenants } from "../features/tenants/tenantsSlice";
import { canUserAccess } from "../lib/permissions";
import { getRelativeTime, formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";

const severityVariant = (severity) => ({
  critical: "danger",
  warning: "warning",
  info: "info",
}[severity] || "default");

const statusVariant = (status) => ({
  active: "danger",
  acknowledged: "info",
  resolved: "success",
}[status] || "default");

const ALERT_TYPES = ["error_rate", "memory", "redis", "mongodb", "response_time", "tenant_quota", "tenant_spike", "backup", "quarantine", "subscription"];

export default function Alerts() {
  const dispatch = useDispatch();
  const { alerts, summary, pagination, loading, managingId } = useSelector((state) => state.alerts);
  const { items: tenants } = useSelector((state) => state.tenants);
  const { user } = useSelector((state) => state.auth);
  const { language } = useSelector((state) => state.ui);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [page, setPage] = useState(1);

  const canManage = canUserAccess(user, "alerts.acknowledge") || canUserAccess(user, "alerts.resolve");

  useEffect(() => {
    dispatch(fetchTenants({ limit: 100 }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchAlerts({
      page,
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
      type: typeFilter || undefined,
      tenantId: tenantFilter || undefined,
    }));
    dispatch(fetchAlertSummary());
    dispatch(fetchActiveAlerts());
  }, [dispatch, page, statusFilter, severityFilter, typeFilter, tenantFilter]);

  const resetPage = (setter) => (e) => { setter(e.target.value); setPage(1); };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title={t("alertsOpen", language)} value={summary.open} variant="default" />
        <StatCard title={t("alertsCritical", language)} value={summary.bySeverity.critical} variant="danger" />
        <StatCard title={t("alertsWarning", language)} value={summary.bySeverity.warning} variant="warning" />
        <StatCard title={t("alertsResolved", language)} value={summary.resolved} variant="success" />
      </div>

      <Card>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={resetPage(setStatusFilter)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              >
                <option value="">{t("alertsAllStatus", language)}</option>
                <option value="active">{t("statusActive", language)}</option>
                <option value="acknowledged">{t("statusAcknowledged", language)}</option>
                <option value="resolved">{t("statusResolved", language)}</option>
              </select>
              <select
                value={severityFilter}
                onChange={resetPage(setSeverityFilter)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              >
                <option value="">{t("alertsAllSeverity", language)}</option>
                <option value="critical">{t("alertsCritical", language)}</option>
                <option value="warning">{t("alertsWarning", language)}</option>
                <option value="info">{t("alertsInfo", language)}</option>
              </select>
              <select
                value={typeFilter}
                onChange={resetPage(setTypeFilter)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              >
                <option value="">{t("alertsAllTypes", language)}</option>
                {ALERT_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`alertType.${type}`, language)}</option>
                ))}
              </select>
              <select
                value={tenantFilter}
                onChange={resetPage(setTenantFilter)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              >
                <option value="">{t("allTenants", language)}</option>
                {tenants.map((tenant) => (
                  <option key={tenant._id} value={tenant._id}>{tenant.name}</option>
                ))}
              </select>
            </div>
            {canManage && (
              <button
                onClick={() => dispatch(acknowledgeAllAlerts())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2"
              >
                <CheckIcon className="w-4 h-4" />
                {t("alertsMarkAllRead", language)}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : alerts.length === 0 ? (
          <EmptyState title={t("noData", language)} description={t("alertsNoneDesc", language)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("alertsSeverity", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("alertsType", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("message", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("tenantName", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("alertsStatus", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("alertsOccurrences", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("alertsLastSeen", language)}</th>
                  {canManage && (
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("actions", language)}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert._id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <Badge variant={severityVariant(alert.severity)} size="sm">{alert.severity}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {t(`alertType.${alert.type}`, language)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[260px]" title={alert.title}>
                        {alert.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]" title={alert.message}>
                        {alert.message}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {alert.tenant?.name || (alert.scope === "tenant" ? <span className="text-slate-400">—</span> : <span className="text-xs text-slate-400">{t("alertsPlatform", language)}</span>)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(alert.status)} size="sm">{t(`status${alert.status.charAt(0).toUpperCase()}${alert.status.slice(1)}`, language)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{alert.occurrenceCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <span title={formatDateTime(alert.lastSeenAt, language)}>{getRelativeTime(alert.lastSeenAt, language)}</span>
                    </td>
                    {canManage && alert.status !== "resolved" && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {alert.status === "active" && (
                            <button
                              onClick={() => dispatch(acknowledgeAlert(alert._id))}
                              disabled={managingId === alert._id}
                              className="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                            >
                              {t("alertsAcknowledge", language)}
                            </button>
                          )}
                          <button
                            onClick={() => dispatch(resolveAlert(alert._id))}
                            disabled={managingId === alert._id}
                            className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                          >
                            {t("alertsResolve", language)}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={setPage} />
        )}
      </Card>
    </div>
  );
}