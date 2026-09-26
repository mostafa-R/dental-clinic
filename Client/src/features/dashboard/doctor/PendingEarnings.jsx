import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import StatCard from "../../../components/ui/StatCard";
import { formatMoney } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { usePermission } from "../../../lib/roles";
import { doctorDashboardApi } from "../doctorDashboardApi";

function WalletIcon() {
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
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

export default function PendingEarnings() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ amount: null, failed: false });

  const hasAccess = usePermission("accounting", "read");

  useEffect(() => {
    if (!hasAccess || !user?._id) return;
    let cancelled = false;
    doctorDashboardApi
      .getCommissions(user._id)
      .then((data) => {
        if (cancelled) return;
        const commissions = data.commissions || [];
        const pending = commissions
          .filter((c) => c.status === "pending")
          .reduce((sum, c) => sum + (c.amount || 0), 0);
        setState({ amount: pending, failed: false });
      })
      // Swallowing the error left `amount` null, so the card rendered an
      // em-dash that was indistinguishable from "still loading" or a genuine
      // zero. A doctor could read a blank earnings figure as "nothing owed".
      .catch(() => {
        if (!cancelled) setState({ amount: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccess, user?._id]);

  if (!hasAccess) return null;

  return (
    <StatCard
      label={t("doctorDashboard.pendingEarnings")}
      value={state.failed ? t("common.unavailable") : state.amount !== null ? formatMoney(state.amount) : "—"}
      icon={<WalletIcon />}
      hint={
        state.failed
          ? t("doctorDashboard.earningsLoadFailed")
          : t("doctorDashboard.earningsHint")
      }
      accent="amber"
    />
  );
}
