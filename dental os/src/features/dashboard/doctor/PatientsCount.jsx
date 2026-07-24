import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import StatCard from "../../../components/ui/StatCard";
import { formatNumber } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { doctorDashboardApi } from "../doctorDashboardApi";

function PatientIcon() {
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
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
      <path d="M20 8V5a1 1 0 0 0-1-1h-3" />
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export default function PatientsCount() {
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
      .getAllMyAppointments(user._id)
      .then((data) => {
        if (cancelled) return;
        const seen = new Set();
        const appts = data.appointments || [];
        for (const a of appts) {
          const pid = a.patient?._id;
          if (pid) seen.add(pid);
        }
        setCount(seen.size);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasAccess, user?._id]);

  if (!hasAccess) return null;

  return (
    <StatCard
      label={t("doctorDashboard.myPatients")}
      value={count !== null ? formatNumber(count) : "—"}
      icon={<PatientIcon />}
      hint={t("doctorDashboard.patientsHint")}
      accent="emerald"
    />
  );
}
