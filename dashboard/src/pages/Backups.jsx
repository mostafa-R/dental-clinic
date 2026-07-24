import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { PageLoader } from "../components/ui/Spinner";
import { ArrowUpTrayIcon } from "../components/ui/icons";
import { fetchBackups, triggerBackup } from "../features/backups/backupsSlice";
import { formatDate } from "../lib/format";
import { t } from "../lib/i18n";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusVariant(status) {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "running":
    case "in_progress":
      return "warning";
    default:
      return "default";
  }
}

export default function Backups() {
  const dispatch = useDispatch();
  const { items, loading, triggering, error } = useSelector((state) => state.backups);
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    dispatch(fetchBackups());
  }, [dispatch]);

  const handleTriggerBackup = () => {
    dispatch(triggerBackup());
  };

  return (
    <AppLayout>
      <Topbar title={t("backups", language)} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("backupsDesc", language)}
          </p>
          <Button onClick={handleTriggerBackup} loading={triggering} icon={ArrowUpTrayIcon}>
            {t("triggerBackup", language)}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading && items.length === 0 ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <ArrowUpTrayIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {t("noBackups", language)}
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("date", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("type", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("status", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("filename", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("size", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("duration", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((backup) => (
                    <tr key={backup._id} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="px-4 py-3 text-slate-900 dark:text-white">
                        {backup.createdAt ? formatDate(backup.createdAt, language) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="default" size="sm">
                          {backup.type || "scheduled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(backup.status)} size="sm">
                          {backup.status || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {backup.filename || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatBytes(backup.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatDuration(backup.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
