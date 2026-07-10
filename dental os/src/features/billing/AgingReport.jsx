import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAgingReport } from './billingSlice';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { useT } from '../../lib/i18n';
import { formatMoney, formatDate } from '../../lib/format';

const AGING_BRACKETS = [
  { key: 'current', labelKey: 'billing.aging.current', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { key: 'overdue1to30', labelKey: 'billing.aging.overdue1to30', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' },
  { key: 'overdue31to60', labelKey: 'billing.aging.overdue31to60', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  { key: 'overdue61Plus', labelKey: 'billing.aging.overdue61Plus', color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
];

export default function AgingReport({ open, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { aging, agingStatus } = useSelector((s) => s.billing);

  useEffect(() => {
    if (open && !aging) dispatch(fetchAgingReport());
  }, [open, aging, dispatch]);

  if (!open) return null;

  const brackets = aging?.aging;
  const invoices = aging?.invoices || [];

  const isLoading = agingStatus === 'loading' || agingStatus === 'idle';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('billing.aging.title')}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {isLoading ? (
          <Spinner label={t('billing.aging.loading')} />
        ) : !brackets ? (
          <EmptyState title={t('billing.aging.empty')} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AGING_BRACKETS.map(({ key, labelKey, color }) => {
                const b = brackets[key] || { count: 0, amount: 0 };
                return (
                  <div key={key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t(labelKey)}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{formatMoney(b.amount)}</p>
                    <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{b.count} {t('billing.aging.invoices')}</p>
                  </div>
                );
              })}
            </div>

            {brackets.total && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('billing.aging.totalOutstanding')}</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{formatMoney(brackets.total.amount)}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{brackets.total.count} {t('billing.aging.invoices')}</span>
                </div>
              </div>
            )}

            {invoices.length > 0 && (
              <Card title={t('billing.aging.details')}>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-start text-xs font-medium uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:text-slate-500">
                        <th className="px-3 py-2 text-start">{t('billing.col.invoice')}</th>
                        <th className="px-3 py-2 text-start">{t('billing.col.patient')}</th>
                        <th className="px-3 py-2 text-start">{t('common.phone')}</th>
                        <th className="px-3 py-2 text-end">{t('billing.col.total')}</th>
                        <th className="px-3 py-2 text-end">{t('billing.col.paid')}</th>
                        <th className="px-3 py-2 text-end">{t('billing.col.balance')}</th>
                        <th className="px-3 py-2 text-start">{t('billing.form.dueDate')}</th>
                        <th className="px-3 py-2 text-start">{t('billing.col.status')}</th>
                        <th className="px-3 py-2 text-end">{t('billing.agingDays')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const balance = inv.total - inv.paidAmount;
                        const patientName = inv.patient
                          ? `${inv.patient.firstName} ${inv.patient.lastName}`
                          : '—';
                        const daysOverdue = inv.daysOverdue ?? (
                          inv.dueDate && new Date(inv.dueDate) < new Date()
                            ? Math.floor((Date.now() - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24))
                            : 0
                        );
                        return (
                          <tr key={inv._id} className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{inv.invoiceNo}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-100">{patientName}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">{inv.patient?.phone || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-end text-slate-700 dark:text-slate-300">{formatMoney(inv.total)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-end text-slate-500 dark:text-slate-400">{formatMoney(inv.paidAmount)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-end font-medium text-slate-900 dark:text-white">{formatMoney(balance)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">
                              {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                                inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' :
                                inv.status === 'partial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' :
                                inv.status === 'unpaid' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' :
                                'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                              }`}>{inv.status}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-end text-xs font-medium text-rose-600 dark:text-rose-400">{daysOverdue > 0 ? `${daysOverdue}d` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
