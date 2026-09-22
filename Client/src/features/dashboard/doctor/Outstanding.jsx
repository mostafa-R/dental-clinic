import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import StatCard from "../../../components/ui/StatCard";
import { formatMoney } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { doctorDashboardApi } from "../doctorDashboardApi";

function InvoiceIcon() {
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
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21l-4-4-1 1-2-2 1-1 2 2 3-3" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 7 15.5V7a2 2 0 0 1 2-2h9l4 4v9.5z" />
    </svg>
  );
}

export default function Outstanding() {
  const { t } = useT();
  const perms = useSelector((s) => s.users.myPermissions);
  const [amount, setAmount] = useState(null);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.billing?.includes("read");

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    doctorDashboardApi
      .getBillingSummary()
      .then((data) => {
        if (cancelled) return;
        setAmount(data.totalOutstanding || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasAccess]);

  if (!hasAccess) return null;

  return (
    <StatCard
      label={t("doctorDashboard.outstanding")}
      value={amount !== null ? formatMoney(amount) : "—"}
      icon={<InvoiceIcon />}
      hint={t("doctorDashboard.outstandingHint")}
      accent="rose"
    />
  );
}
