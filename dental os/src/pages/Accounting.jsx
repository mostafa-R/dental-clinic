import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';

import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import StatCard from '../components/ui/StatCard';
import ExpenseModal from '../features/accounting/ExpenseModal';
import OwnerDrawingModal from '../features/accounting/OwnerDrawingModal';
import DayCloseTab from '../features/accounting/DayCloseTab';
import JournalTab from '../features/accounting/JournalTab';
import {
  deleteExpense,
  deleteDrawing,
  fetchCommissions,
  fetchDrawings,
  fetchExpenses,
  fetchSummary,
  updateCommission,
} from '../features/accounting/accountingSlice';
import { showErrorDialog } from '../features/ui/uiSlice';
import { canManageAccounting } from '../lib/roles';
import {
  COMMISSION_STATUS_STYLES,
} from '../features/accounting/accounting';
import { formatDate, formatMoney } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';

const TABS = [
  { key: 'summary', labelKey: 'accounting.tab.summary' },
  { key: 'expenses', labelKey: 'accounting.tab.expenses' },
  { key: 'drawings', labelKey: 'accounting.tab.drawings' },
  { key: 'commissions', labelKey: 'accounting.tab.commissions' },
  { key: 'dayclose', labelKey: 'accounting.tab.dayClose' },
  { key: 'journal', labelKey: 'accounting.tab.journal' },
];

export default function Accounting() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { summary, summaryStatus, expenses, drawings, commissions } = useSelector((s) => s.accounting);
  const user = useSelector((s) => s.auth.user);
  const canManage = canManageAccounting();

  const [tab, setTab] = useState('summary');
  const [expenseModal, setExpenseModal] = useState(false);
  const [drawingModal, setDrawingModal] = useState(false);

  useEffect(() => {
    if (summaryStatus === 'idle') dispatch(fetchSummary());
  }, [dispatch, summaryStatus]);

  useEffect(() => {
    if (tab === 'expenses') dispatch(fetchExpenses({ limit: 50 }));
    if (tab === 'drawings') dispatch(fetchDrawings({ limit: 50 }));
    if (tab === 'commissions') dispatch(fetchCommissions({ limit: 50 }));
  }, [dispatch, tab]);

  const refetchAll = useCallback(() => {
    dispatch(fetchSummary());
    if (tab === 'expenses') dispatch(fetchExpenses({ limit: 50 }));
    if (tab === 'drawings') dispatch(fetchDrawings({ limit: 50 }));
    if (tab === 'commissions') dispatch(fetchCommissions({ limit: 50 }));
  }, [dispatch, tab]);
  useSocketEvent('expense:created', refetchAll);
  useSocketEvent('expense:deleted', refetchAll);
  useSocketEvent('drawing:created', refetchAll);
  useSocketEvent('drawing:deleted', refetchAll);
  useSocketEvent('commission:updated', refetchAll);

  const onDeleteExpense = async (id) => {
    if (!window.confirm(t('accounting.expense.deleteConfirm'))) return;
    try {
      await dispatch(deleteExpense(id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onDeleteDrawing = async (id) => {
    if (!window.confirm(t('accounting.drawing.deleteConfirm'))) return;
    try {
      await dispatch(deleteDrawing(id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onPayCommission = async (id) => {
    try {
      await dispatch(updateCommission({ id, payload: { status: 'paid' } })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const applyDateFilter = useCallback(() => {
    dispatch(fetchSummary({ from: dateFrom || undefined, to: dateTo || undefined }));
  }, [dispatch, dateFrom, dateTo]);

  const s = summary?.summary;
  const isLoading = summaryStatus === 'loading' || summaryStatus === 'idle';

  const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#f97316'];

  const monthlyChartData = useMemo(() => {
    const raw = summary?.monthlyRevenue || [];
    return raw.map((r) => {
      const label = new Date(r.year, r.month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
      return { label, revenue: r.revenue, count: r.count };
    });
  }, [summary]);

  const expensePieData = useMemo(() => {
    const raw = summary?.expenseByCategory || [];
    return raw.map((c) => ({ name: t(`accounting.category.${c.category}`), value: c.total }));
  }, [summary, t]);

  const revenuePieData = useMemo(() => {
    const raw = summary?.revenueByMethod || [];
    return raw.map((r) => ({ name: t(`invoice.payment.${r.method}`), value: r.total }));
  }, [summary, t]);

  const CHART_COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#f97316'];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('accounting.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('accounting.subtitle')}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === tb.key
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {/* Summary */}
      {tab === 'summary' && (
        isLoading ? <Spinner label={t('accounting.loading')} /> : s ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.from')}</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.to')}</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
              <button type="button" onClick={applyDateFilter} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
                {t('accounting.filter')}
              </button>
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); dispatch(fetchSummary()); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                  {t('accounting.clear')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label={t('accounting.totalCollected')} value={formatMoney(s.totalCollected)} />
              <StatCard label={t('accounting.totalExpenses')} value={formatMoney(s.totalExpenses)} />
              <StatCard label={t('accounting.totalDrawings')} value={formatMoney(s.totalDrawings)} />
              <StatCard label={t('accounting.netProfit')} value={formatMoney(s.netProfit)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title={t('accounting.monthlyRevenue')}>
                {monthlyChartData.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(value) => [formatMoney(value), t('accounting.revenue')]}
                      />
                      <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <div className="grid grid-cols-1 gap-6">
                <Card title={t('accounting.commissions')}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{t('accounting.pendingCommissions')}</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">{formatMoney(s.pendingCommissions)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{t('accounting.paidCommissions')}</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(s.paidCommissions)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{t('accounting.totalBilled')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatMoney(s.totalBilled)}</span>
                    </div>
                  </div>
                </Card>

                <Card title={t('accounting.expenseByCategory')}>
                  {expensePieData.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      <PieChart width={140} height={140}>
                        <Pie data={expensePieData} cx={70} cy={70} innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                          {expensePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                      <div className="space-y-1.5">
                        {expensePieData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-slate-500 dark:text-slate-400">{d.name}</span>
                            <span className="font-medium text-slate-900 dark:text-white">{formatMoney(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title={t('accounting.revenueByMethod')}>
                {revenuePieData.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-4">
                    <PieChart width={140} height={140}>
                      <Pie data={revenuePieData} cx={70} cy={70} innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                        {revenuePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                    <div className="space-y-1.5">
                      {revenuePieData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-slate-500 dark:text-slate-400">{d.name}</span>
                          <span className="font-medium text-slate-900 dark:text-white">{formatMoney(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              <Card title={t('accounting.monthlyDetails')}>
                {(summary?.monthlyRevenue || []).length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {summary.monthlyRevenue.slice().reverse().map((r) => {
                      const monthName = new Date(r.year, r.month - 1).toLocaleString('default', { month: 'short' });
                      return (
                        <div key={`${r.year}-${r.month}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                          <span className="text-sm text-slate-600 dark:text-slate-300">{monthName} {r.year}</span>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{formatMoney(r.revenue)}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{r.count} {t('accounting.transactions')}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : <EmptyState title={t('accounting.loadFailed')} />
      )}

      {/* Expenses */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {canManage && (
            <button type="button" onClick={() => setExpenseModal(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
              {t('accounting.expense.new')}
            </button>
          )}
          {expenses.status === 'loading' && <Spinner label={t('accounting.loading')} />}
          {expenses.status === 'succeeded' && expenses.items.length === 0 && <EmptyState title={t('accounting.expense.empty')} />}
          {expenses.status === 'succeeded' && expenses.items.length > 0 && (
            <Card padded={false}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="px-5 py-3">{t('accounting.date')}</th>
                    <th className="px-5 py-3">{t('accounting.expense.category')}</th>
                    <th className="px-5 py-3">{t('accounting.expense.description')}</th>
                    <th className="px-5 py-3">{t('accounting.amount')}</th>
                    <th className="px-5 py-3">{t('accounting.expense.paymentMethod')}</th>
                    {canManage && <th className="px-5 py-3 text-end">{t('patients.col.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {expenses.items.map((e) => (
                    <tr key={e._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDate(e.date)}</td>
                      <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">{t(`accounting.category.${e.category}`)}</span></td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{e.description}</td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{formatMoney(e.amount)}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{t(`accounting.payment.${e.paymentMethod}`)}</td>
                      {canManage && (
                        <td className="px-5 py-3 text-end">
                           <button type="button" onClick={() => onDeleteExpense(e._id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                            {t('common.archive')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Drawings */}
      {tab === 'drawings' && (
        <div className="space-y-4">
          {canManage && (
            <button type="button" onClick={() => setDrawingModal(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
              {t('accounting.drawing.new')}
            </button>
          )}
          {drawings.status === 'loading' && <Spinner label={t('accounting.loading')} />}
          {drawings.status === 'succeeded' && drawings.items.length === 0 && <EmptyState title={t('accounting.drawing.empty')} />}
          {drawings.status === 'succeeded' && drawings.items.length > 0 && (
            <Card padded={false}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="px-5 py-3">{t('accounting.date')}</th>
                    <th className="px-5 py-3">{t('accounting.drawing.owner')}</th>
                    <th className="px-5 py-3">{t('accounting.expense.description')}</th>
                    <th className="px-5 py-3">{t('accounting.amount')}</th>
                    {canManage && <th className="px-5 py-3 text-end">{t('patients.col.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {drawings.items.map((d) => (
                    <tr key={d._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDate(d.date)}</td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{d.owner?.name || '—'}</td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{d.description || '—'}</td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{formatMoney(d.amount)}</td>
                      {canManage && (
                        <td className="px-5 py-3 text-end">
                           <button type="button" onClick={() => onDeleteDrawing(d._id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                            {t('common.archive')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Commissions */}
      {tab === 'commissions' && (
        <div className="space-y-4">
          {commissions.status === 'loading' && <Spinner label={t('accounting.loading')} />}
          {commissions.status === 'succeeded' && commissions.items.length === 0 && <EmptyState title={t('accounting.commission.empty')} />}
          {commissions.status === 'succeeded' && commissions.items.length > 0 && (
            <Card padded={false}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="px-5 py-3">{t('accounting.commission.doctor')}</th>
                    <th className="px-5 py-3">{t('accounting.commission.procedure')}</th>
                    <th className="px-5 py-3">{t('accounting.commission.rate')}</th>
                    <th className="px-5 py-3">{t('accounting.amount')}</th>
                    <th className="px-5 py-3">{t('patients.col.status')}</th>
                    {canManage && <th className="px-5 py-3 text-end">{t('patients.col.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {commissions.items.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{c.doctor?.name || '—'}</td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{c.procedureName}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{c.rate}%</td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{formatMoney(c.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COMMISSION_STATUS_STYLES[c.status]}`}>
                          {t(`accounting.commission.status.${c.status}`)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3 text-end">
                          {c.status === 'pending' && (
                            <button type="button" onClick={() => onPayCommission(c._id)} className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/15">
                              {t('accounting.commission.markPaid')}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Day Close */}
      {tab === 'dayclose' && <DayCloseTab />}

      {/* Journal */}
      {tab === 'journal' && <JournalTab />}

      <ExpenseModal open={expenseModal} onClose={() => setExpenseModal(false)} />
      <OwnerDrawingModal open={drawingModal} onClose={() => setDrawingModal(false)} />
    </div>
  );
}
