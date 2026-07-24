import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Spinner from "../../../components/ui/Spinner";
import { useT } from "../../../lib/i18n";
import { doctorDashboardApi } from "../doctorDashboardApi";

export default function ActivePlans() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const perms = useSelector((s) => s.users.myPermissions);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.emr?.includes("read");

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
    <Card title={t("doctorDashboard.activePlans")}>
      {loading && !plans && <Spinner label={t("common.loading")} />}

      {!loading && (!plans || plans.length === 0) && (
        <EmptyState
          title={t("doctorDashboard.noActivePlans")}
          message={t("doctorDashboard.noActivePlansHint")}
        />
      )}

      {plans && plans.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {plans.map((plan) => {
            const total = plan.items?.length || 0;
            const done = plan.completedCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <li key={plan._id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {plan.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {plan.patient?.firstName} {plan.patient?.lastName}
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      {plan.planNo}
                    </p>
                  </div>
                  <Link
                    to={`/patients/${plan.patient?._id}/emr`}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {t("common.view")}
                  </Link>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all dark:bg-indigo-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {done}/{total}
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
