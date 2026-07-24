import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { doctorDashboardApi } from '../doctorDashboardApi';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import { formatMoney } from '../../../lib/format';
import { useT } from '../../../lib/i18n';

export default function FinancialSummary() {
  const { t } = useT();
  const perms = useSelector((s) => s.users.myPermissions);
  const [data, setData] = useState(null);

  const hasAccess = perms?.isSystemAdmin || perms?.permissions?.accounting?.includes('read');

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
    return () => { cancelled = true; };
  }, [hasAccess]);

  if (!hasAccess) return null;

  const s = data?.summary;
  if (!s) return null;

  const rows = [
    { label: t('doctorDashboard.totalRevenue'), value: s.totalCollected, accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('doctorDashboard.totalExpenses'), value: s.totalExpenses, accent: 'text-rose-600 dark:text-rose-400' },
    { label: t('doctorDashboard.netProfit'), value: s.netProfit, accent: s.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
    { label: t('doctorDashboard.pendingCommissions'), value: s.pendingCommissions, accent: 'text-amber-600 dark:text-amber-400' },
    { label: t('doctorDashboard.paidCommissions'), value: s.paidCommissions, accent: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <Card title={t('doctorDashboard.financialSummary')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{row.label}</p>
            <p className={`mt-1 text-xl font-semibold ${row.accent}`}>{formatMoney(row.value)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
