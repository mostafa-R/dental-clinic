import { useSelector } from 'react-redux';
import { statusStyle, statusTKey } from './statuses';
import { formatDate, formatMoney } from '../../lib/format';
import { canManageBilling, canVoidBilling } from '../../lib/roles';
import { useT } from '../../lib/i18n';

export default function InvoicesTable({ onView, onPay, onVoid }) {
  const { t } = useT();
  const { items } = useSelector((s) => s.billing);
  const canManage = canManageBilling();
  const canVoid = canVoidBilling();

  if (!items.length) {
    return (
      <div className="px-5 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
        {t('billing.empty')}
      </div>
    );
  }

  const thCls = 'px-5 py-3 font-medium text-slate-400 dark:text-slate-500';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <th className={thCls}>{t('billing.col.invoice')}</th>
            <th className={thCls}>{t('billing.col.patient')}</th>
            <th className={thCls}>{t('billing.col.date')}</th>
            <th className={`${thCls} text-end`}>{t('billing.col.total')}</th>
            <th className={`${thCls} text-end`}>{t('billing.col.paid')}</th>
            <th className={`${thCls} text-end`}>{t('billing.col.balance')}</th>
            <th className={thCls}>{t('billing.col.status')}</th>
            <th className={`${thCls} text-end`}>{t('billing.col.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {items.map((inv) => {
            const balance = Number(inv.balance ?? inv.total - inv.paidAmount);
            const canPay = canManage && inv.status !== 'void' && balance > 0.001;
            return (
              <tr key={inv._id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{inv.invoiceNo}</td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => onView(inv)}
                    className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                  >
                    {inv.patient?.fullName || '—'}
                  </button>
                </td>
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDate(inv.createdAt)}</td>
                <td className="px-5 py-3 text-end font-medium text-slate-800 dark:text-slate-100">{formatMoney(inv.total)}</td>
                <td className="px-5 py-3 text-end text-slate-600 dark:text-slate-300">{formatMoney(inv.paidAmount)}</td>
                <td className="px-5 py-3 text-end text-slate-600 dark:text-slate-300">{formatMoney(balance)}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusStyle(inv.status)}`}>
                    {t(statusTKey(inv.status))}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onView(inv)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {t('common.view')}
                    </button>
                    {canPay && (
                      <button
                        type="button"
                        onClick={() => onPay(inv)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                      >
                        {t('billing.pay')}
                      </button>
                    )}
                    {canVoid && inv.status !== 'void' && (
                      <button
                        type="button"
                        onClick={() => onVoid?.(inv)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
                      >
                        {t('billing.void')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
