import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Pagination from "../components/ui/Pagination";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import { fetchErrorLogs, fetchErrorLogStats } from "../features/errorLogs/errorLogsSlice";
import { fetchTenants } from "../features/tenants/tenantsSlice";
import { formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";

const statusVariant = (code) => {
  if (code >= 500) return "danger";
  if (code >= 400) return "warning";
  return "default";
};

export default function ErrorLogs() {
  const dispatch = useDispatch();
  const { logs, stats, loading, pagination } = useSelector((state) => state.errorLogs);
  const { items: tenants } = useSelector((state) => state.tenants);
  const { language } = useSelector((state) => state.ui);
  const [tenantFilter, setTenantFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchTenants({ limit: 100 }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchErrorLogs({ page, tenantId: tenantFilter || undefined, statusCode: statusFilter || undefined }));
    dispatch(fetchErrorLogStats());
  }, [dispatch, page, tenantFilter, statusFilter]);

  return (
    <div className="p-6">
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard title={t("total", language)} value={stats.stats.total} variant="default" />
          <StatCard title="4xx" value={stats.stats["4xx"]} variant="warning" />
          <StatCard title="5xx" value={stats.stats["5xx"]} variant="danger" />
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={tenantFilter}
              onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
            >
              <option value="">{t("allTenants", language)}</option>
              {tenants.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
            >
              <option value="">{t("allStatus", language)}</option>
              <option value="400">400</option>
              <option value="401">401</option>
              <option value="403">403</option>
              <option value="404">404</option>
              <option value="409">409</option>
              <option value="422">422</option>
              <option value="429">429</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : logs.length === 0 ? (
          <EmptyState title={t("noData", language)} description={t("noErrorLogsDesc", language)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("date", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("status", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("method", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">URL</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("tenantName", language)}</th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500">{t("message", language)}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt, language)}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(log.statusCode)} size="sm">{log.statusCode}</Badge></td>
                    <td className="px-4 py-3"><code className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{log.method}</code></td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate font-mono">{log.url}</td>
                    <td className="px-4 py-3 text-xs">{log.tenant?.name || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[250px] truncate">{log.message || "—"}</td>
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
