import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Spinner from "../../../components/ui/Spinner";
import { formatTime } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { useSocketEvent } from "../../../lib/socket";
import { doctorDashboardApi } from "../doctorDashboardApi";

const STATUS_COLORS = {
  scheduled:
    "bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-500/15 dark:text-indigo-300",
  confirmed: "bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-500/15 dark:text-blue-300",
  checked_in:
    "bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300",
  in_progress:
    "bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300",
  completed:
    "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-700/40 dark:text-slate-300",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300",
  no_show:
    "bg-purple-50 text-purple-700 ring-purple-500/20 dark:bg-purple-500/15 dark:text-purple-300",
};

const DOT_COLORS = {
  scheduled: "bg-indigo-500",
  confirmed: "bg-blue-500",
  checked_in: "bg-amber-500",
  in_progress: "bg-emerald-500",
  completed: "bg-slate-400",
  cancelled: "bg-rose-500",
  no_show: "bg-purple-500",
};

export default function TodaySchedule() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const perms = useSelector((s) => s.users.myPermissions);
  const [appointments, setAppointments] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.appointments?.includes("read");

  const fetchAppointments = () => {
    if (!hasAccess || !user?._id) return;
    setLoading(true);
    doctorDashboardApi
      .getTodayAppointments(user._id)
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAppointments();
  }, [hasAccess, user?._id]);

  useSocketEvent("appointment:created", fetchAppointments);
  useSocketEvent("appointment:updated", fetchAppointments);
  useSocketEvent("appointment:statusChanged", fetchAppointments);

  if (!hasAccess) return null;

  const sorted = appointments
    ? [...appointments].sort((a, b) => new Date(a.start) - new Date(b.start))
    : [];

  return (
    <Card title={t("doctorDashboard.todaySchedule")} accent="indigo">
      {loading && !appointments && <Spinner label={t("common.loading")} />}

      {!loading && sorted.length === 0 && (
        <EmptyState
          title={t("doctorDashboard.noAppointments")}
          message={t("doctorDashboard.noAppointmentsHint")}
        />
      )}

      {sorted.length > 0 && (
        <ul className="relative ml-2 space-y-0">
          {sorted.map((appt, i) => {
            const isLast = i === sorted.length - 1;
            const dotColor = DOT_COLORS[appt.status] || "bg-slate-400";
            return (
              <li key={appt._id} className="relative flex items-start gap-4 py-3.5 pl-7">
                {!isLast && (
                  <span className="absolute left-[7px] top-9 h-[calc(100%-12px)] w-px bg-slate-200 dark:bg-slate-700" />
                )}
                <span className="absolute left-0 top-4.5 flex h-4 w-4 -translate-x-1/2 items-center justify-center">
                  <span className={`h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${dotColor}`} />
                </span>

                <div className="flex w-20 shrink-0 flex-col text-xs">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatTime(appt.start)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">{formatTime(appt.end)}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {appt.patient?.firstName} {appt.patient?.lastName}
                  </p>
                  {appt.reason && (
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {appt.reason}
                    </p>
                  )}
                </div>

                {appt.chair && (
                  <span className="hidden shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400">
                    {appt.chair}
                  </span>
                )}

                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[appt.status] || "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-700/40 dark:text-slate-300"}`}
                >
                  {t(`appointment.status.${appt.status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
