import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Spinner from "../../../components/ui/Spinner";
import { useT } from "../../../lib/i18n";
import { usePermission } from "../../../lib/roles";
import { doctorDashboardApi } from "../doctorDashboardApi";

export default function ActivePlans() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasAccess = usePermission("emr", "read");

  useEffect(() => {
    if (!hasAccess || !user?._id) return;
    let cancelled = false;

    doctorDashboardApi
      .getAllMyAppointments(user._id)
      .then(async (data) => {
        if (cancelled) return;
        const appts = data.appointments || [];
        const seen = new Set();
        const patientIds = [];
        for (const a of appts) {
          const pid = a.patient?._id;
          if (pid && !seen.has(pid)) {
            seen.add(pid);
            patientIds.push(pid);
          }
        }

        const recent = patientIds.slice(0, 10);
        const results = await Promise.all(
          recent.map((pid) =>
            doctorDashboardApi.getTreatmentPlans(pid).catch(() => []),
          ),
        );

        if (cancelled) return;
        const all = results.flat().filter((p) => p.status === "active");
        setPlans(all.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasAccess, user?._id]);

  if (!hasAccess) return null;

  return (
    <Card title={t("doctorDashboard.activePlans")} accent="violet">
      {loading && !plans && <Spinner label={t("common.loading")} />}

      {!loading && (!plans || plans.length === 0) && (
        <EmptyState
          title={t("doctorDashboard.noActivePlans")}
          message={t("doctorDashboard.noActivePlansHint")}
        />
      )}

      {plans && plans.length > 0 && (
        <ul className="space-y-1">
          {plans.map((plan) => {
            const total = plan.items?.length || 0;
            const done = plan.completedCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const progressColor =
              pct >= 75
                ? "bg-emerald-500"
                : pct >= 40
                  ? "bg-brand"
                  : "bg-amber-500";

            return (
              <li key={plan._id} className="group rounded-xl p-3 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {plan.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {plan.patient?.firstName} {plan.patient?.lastName}
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      {plan.planNo}
                    </p>
                  </div>
                  <Link
                    to={`/patients/${plan.patient?._id}/emr`}
                    className="shrink-0 rounded-lg bg-brand/5 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10 dark:bg-brand/20 dark:text-brand-light dark:hover:bg-brand/25"
                  >
                    {t("common.view")}
                  </Link>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${progressColor} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {pct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
