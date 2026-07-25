import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { formatNumber } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { doctorDashboardApi } from "../doctorDashboardApi";

function AlertTriangleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

export default function LowStock() {
  const { t } = useT();
  const perms = useSelector((s) => s.users.myPermissions);
  const [items, setItems] = useState(null);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.inventory?.includes("read");

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    doctorDashboardApi
      .getLowStock()
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccess]);

  if (!hasAccess) return null;

  return (
    <Card
      title={t("doctorDashboard.lowStock")}
      accent="rose"
      action={
        <Link
          to="/inventory"
          className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-400 dark:hover:bg-rose-500/25"
        >
          {t("common.view")}
        </Link>
      }
    >
      {items === null && (
        <p className="py-4 text-center text-sm text-slate-400">
          {t("common.loading")}
        </p>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title={t("doctorDashboard.noLowStock")}
          message={t("doctorDashboard.noLowStockHint")}
        />
      )}

      {items && items.length > 0 && (
        <ul className="space-y-1">
          {items.slice(0, 5).map((item) => {
            const ratio = item.reorderPoint > 0 ? item.quantity / item.reorderPoint : 0;
            const urgency = ratio <= 0.3 ? "critical" : ratio <= 0.6 ? "warning" : "low";
            const urgencyStyles = {
              critical: "border-l-rose-500 bg-rose-50/50 dark:bg-rose-500/5",
              warning: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-500/5",
              low: "border-l-transparent",
            };
            return (
              <li
                key={item._id}
                className={`group flex items-center justify-between rounded-xl border-l-2 p-3 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${urgencyStyles[urgency]}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {urgency === "critical" && (
                    <span className="shrink-0 text-rose-500 dark:text-rose-400">
                      <AlertTriangleIcon />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {t("inventory.category." + item.category)} · {item.sku || "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${
                    urgency === "critical"
                      ? "text-rose-600 dark:text-rose-400"
                      : urgency === "warning"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-600 dark:text-slate-300"
                  }`}>
                    {formatNumber(item.quantity)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t("doctorDashboard.reorderAt")} {item.reorderPoint}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
