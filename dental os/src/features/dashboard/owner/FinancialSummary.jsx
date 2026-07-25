import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Card from "../../../components/ui/Card";
import { formatMoney } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
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
  revenue: { icon: RevenueIcon, gradient: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-500/20' },
  expenses: { icon: ExpenseIcon, gradient: 'from-rose-500 to-pink-500', ring: 'ring-rose-500/20' },
  profit: { icon: ProfitIcon, gradient: 'from-indigo-500 to-blue-500', ring: 'ring-indigo-500/20' },
  pending: { icon: PendingIcon, gradient: 'from-amber-500 to-orange-500', ring: 'ring-amber-500/20' },
  paid: { icon: PaidIcon, gradient: 'from-slate-500 to-gray-500', ring: 'ring-slate-500/20' },
};

export default function FinancialSummary() {
  const { t } = useT();
  const perms = useSelector((s) => s.users.myPermissions);
  const [data, setData] = useState(null);

  const hasAccess =
    perms?.isSystemAdmin || perms?.permissions?.accounting?.includes("read");

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
    <Card title={t("doctorDashboard.financialSummary")} accent="emerald">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const meta = FINANCIAL_META[row.key];
          const Icon = meta.icon;
          return (
            <div
              key={row.key}
              className="group relative overflow-hidden rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:from-slate-800 dark:to-slate-900"
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
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${meta.gradient} text-white shadow-sm ring-4 ${meta.ring} transition-transform duration-200 group-hover:scale-110`}>
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
