import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Input from "../components/ui/Input";
import PageHeader from "../components/ui/PageHeader";
import Pagination from "../components/ui/Pagination";
import Select from "../components/ui/Select";
import { PageLoader } from "../components/ui/Spinner";
import {
  ArrowDownTrayIcon,
  FilterIcon,
} from "../components/ui/icons";
import {
  fetchAuditActions,
  fetchAuditLogs,
} from "../features/auditLogs/auditLogsSlice";
import { formatDateTime } from "../lib/format";
import { actionVariant } from "../lib/audit";
import { downloadCsv } from "../lib/exportCsv";
import { t } from "../lib/i18n";

const TARGET_TYPES = ["tenant", "branch", "admin", "subscription", "plan", "platform"];

export default function AuditLogs() {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logs, loading, pagination, actions } = useSelector(
    (state) => state.auditLogs,
  );
  const { language } = useSelector((state) => state.ui);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState(
    searchParams.get("targetType") || "",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = {
      page,
      action: actionFilter || undefined,
      targetType: targetTypeFilter || undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
    };
    dispatch(fetchAuditLogs(params));
    dispatch(fetchAuditActions());
  }, [dispatch, page, actionFilter, targetTypeFilter, startDate, endDate]);

  const handlePageChange = (p) => setPage(p);

  const hasFilters = actionFilter || targetTypeFilter || startDate || endDate;

  const resetFilters = () => {
    setActionFilter("");
    setTargetTypeFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    if (searchParams.has("targetType")) setSearchParams({});
  };

  const exportRows = () => {
    downloadCsv({
      filename: t("exportAuditLogs", language),
      rows: logs,
      headers: [
        { label: t("action", language), getValue: (r) => t(r.action, language) },
        { label: t("admin", language), getValue: (r) => r.admin?.name || r.adminEmail || "" },
        { label: t("email", language), getValue: (r) => r.adminEmail || "" },
        { label: t("role", language), getValue: (r) => r.adminRole || "" },
        { label: t("target", language), getValue: (r) => r.target?.name || r.target?.id || "" },
        { label: t("targetType", language), getValue: (r) => r.target?.type || "" },
        { label: t("date", language), getValue: (r) => formatDateTime(r.createdAt, language) },
        { label: t("ip", language), getValue: (r) => r.ip || "" },
      ],
    });
  };

  return (
    <div className="p-6">
      <PageHeader
        title={t("auditLogs", language)}
        subtitle={t("auditLogsDesc", language)}
        actions={
          <Button variant="outline" onClick={exportRows} icon={ArrowDownTrayIcon}>
            {t("exportCsv", language)}
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Select
                label={t("action", language)}
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("allActions", language)}</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {t(a, language)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                label={t("targetType", language)}
                value={targetTypeFilter}
                onChange={(e) => {
                  setTargetTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("allTargetTypes", language)}</option>
                {TARGET_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {t(tt, language)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Input
                label={t("fromDate", language)}
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-40">
              <Input
                label={t("toDate", language)}
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={FilterIcon} onClick={resetFilters}>
                {t("clearFilters", language)}
              </Button>
            )}
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