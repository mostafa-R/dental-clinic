import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Pagination from "../components/ui/Pagination";
import { PageLoader } from "../components/ui/Spinner";
import {
  fetchAuditActions,
  fetchAuditLogs,
} from "../features/auditLogs/auditLogsSlice";
import { formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";

const actionVariant = (action) => {
  if (action?.includes("delete") || action?.includes("suspend"))
    return "danger";
  if (action?.includes("create") || action?.includes("activate"))
    return "success";
  if (action?.includes("update") || action?.includes("toggle"))
    return "warning";
  return "default";
};

export default function AuditLogs() {
  const dispatch = useDispatch();
  const { logs, loading, pagination, actions } = useSelector(
    (state) => state.auditLogs,
  );
  const { language } = useSelector((state) => state.ui);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchAuditLogs({ page, action: actionFilter || undefined }));
    dispatch(fetchAuditActions());
  }, [dispatch, page, actionFilter]);

  const handlePageChange = (p) => setPage(p);

  return (
    <div className="p-6">
      <Card>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
            >
              <option value="">{t("allActions", language)}</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {t(a, language)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : logs.length === 0 ? (
          <EmptyState
            title={t("noAuditLogs", language)}
            description={t("noAuditLogsDesc", language)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400">
                    {t("action", language)}
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400">
                    {t("admin", language)}
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400">
                    {t("target", language)}
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400">
                    {t("date", language)}
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400">
                    {t("ip", language)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log._id}
                    className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  >
                    <td className="px-4 py-3">
                      <Badge variant={actionVariant(log.action)} size="sm">
                        {t(log.action, language)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900 dark:text-white">
                        {log.admin?.name || log.adminEmail}
                      </div>
                      <div className="text-xs text-slate-500">
                        {log.adminRole}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.target ? (
                        <div>
                          <span className="text-xs text-slate-500 uppercase">
                            {log.target.type}
                          </span>
                          <div className="text-slate-900 dark:text-white">
                            {log.target.name || log.target.id}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <div>{formatDateTime(log.createdAt, language)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {log.ip || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pages}
            onPageChange={handlePageChange}
          />
        )}
      </Card>
    </div>
  );
}
