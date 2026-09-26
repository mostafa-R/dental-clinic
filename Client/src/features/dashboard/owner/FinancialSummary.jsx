import { useEffect, useState } from "react";
import Card from "../../../components/ui/Card";
import { formatMoney } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { usePermission } from "../../../lib/roles";
import { doctorDashboardApi } from "../doctorDashboardApi";

function RevenueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ExpenseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ProfitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PaidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

const FINANCIAL_META = {
  revenue: { icon: RevenueIcon, bg: 'bg-brand' },
  expenses: { icon: ExpenseIcon, bg: 'bg-rose-500' },
  profit: { icon: ProfitIcon, bg: 'bg-brand' },
  pending: { icon: PendingIcon, bg: 'bg-amber-500' },
  paid: { icon: PaidIcon, bg: 'bg-slate-500' },
};

export default function FinancialSummary() {
  const { t } = useT();
  const [data, setData] = useState(null);

  const hasAccess = usePermission("accounting", "read");

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    doctorDashboardApi
      .getAccountingSummary()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccess]);

  if (!hasAccess) return null;

  const s = data?.summary;
  if (!s) return null;

  const rows = [
    {
      key: "revenue",
      label: t("doctorDashboard.totalRevenue"),
      value: s.totalCollected,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "expenses",
      label: t("doctorDashboard.totalExpenses"),
      value: s.totalExpenses,
      accent: "text-rose-600 dark:text-rose-400",
    },
    {
      key: "profit",
      label: t("doctorDashboard.netProfit"),
      value: s.netProfit,
      accent:
        s.netProfit >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
    },
    {
      key: "pending",
      label: t("doctorDashboard.pendingCommissions"),
      value: s.pendingCommissions,
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "paid",
      label: t("doctorDashboard.paidCommissions"),
      value: s.paidCommissions,
      accent: "text-slate-600 dark:text-slate-300",
    },
  ];

  return (
    <Card title={t("doctorDashboard.financialSummary")} accent="brand">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const meta = FINANCIAL_META[row.key];
          const Icon = meta.icon;
          return (
            <div
              key={row.key}
              className="group rounded-xl border border-slate-100 bg-white p-4 transition-shadow duration-150 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {row.label}
                  </p>
                  <p className={`mt-1.5 text-xl font-bold ${row.accent}`}>
                    {formatMoney(row.value)}
                  </p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} text-white shadow-sm`}>
                  <Icon />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
