import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import StatCard from "../../../components/ui/StatCard";
import { formatNumber } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { doctorDashboardApi } from "../doctorDashboardApi";

function CalendarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function TodayCount() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const perms = useSelector((s) => s.users.myPermissions);
  const [count, setCount] = useState(null);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.appointments?.includes("read");

  useEffect(() => {
    if (!hasAccess || !user?._id) return;
    let cancelled = false;
    doctorDashboardApi
      .getTodayAppointments(user._id)
      .then((appts) => {
        if (!cancelled) setCount(appts.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasAccess, user?._id]);

  if (!hasAccess) return null;

  return (
    <StatCard
      label={t("doctorDashboard.todayAppointments")}
      value={count !== null ? formatNumber(count) : "—"}
      icon={<CalendarIcon />}
      hint={t("doctorDashboard.todayHint")}
      accent="violet"
    />
  );
}
