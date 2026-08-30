import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { fetchDayClose, fetchDayCloses, submitCloseDay } from './accountingSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { canManageAccounting } from '../../lib/roles';
import { formatDate, formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSocketEvent } from '../../lib/socket';

function dateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const METHODS = ['cash', 'card', 'transfer', 'wallet'];

export default function DayCloseTab() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { dayClose, dayCloses, closeStatus } = useSelector((s) => s.accounting);
  const canManage = canManageAccounting();
  const preview = dayClose.preview;

  const [date, setDate] = useState(() => dateInputValue(new Date()));
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(() => {
    dispatch(fetchDayClose({ date }));
    dispatch(fetchDayCloses({ limit: 50 }));
  }, [dispatch, date]);

  useEffect(() => {
    load();
  }, [load]);

  const onDayClosed = useCallback(() => load(), [load]);
  useSocketEvent('dayclose:closed', onDayClosed);

  const expectedTotal = useMemo(() => {
    if (!preview || !preview.expected) return 0;
    return METHODS.reduce((sum, m) => sum + (Number(preview.expected[m]) || 0), 0);
  }, [preview]);

  const handleClose = async () => {
    if (countedCash === '' || Number.isNaN(Number(countedCash))) {
      dispatch(showErrorDialog({ message: t('accounting.dayClose.enterCount') }));
      return;
    }
    try {
      const result = await dispatch(
        submitCloseDay({ date, countedCash: Number(countedCash), notes: notes || undefined }),
      ).unwrap();
      setCountedCash('');
      setNotes('');
      if (result) dispatch(fetchDayCloses({ limit: 50 }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.date')}</label>
          <input type="date" value={date} max={dateInputValue(new Date())} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {t('accounting.filter')}
        </button>
      </div>

      {dayClose.status === 'loading' ? (
        <Spinner label={t('accounting.loading')} />
      ) : dayClose.status === 'failed' ? (
        <EmptyState title={t('accounting.loadFailed')} />
      ) : preview ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title={t('accounting.dayClose.title')}>
            <div className="space-y-3">
              {METHODS.map((m) => (
                <div key={m} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t(`accounting.payment.${m}`)}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{formatMoney(preview.expected?.[m] || 0)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('accounting.dayClose.expectedTotal')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(expectedTotal)}</span>
              </div>

              {preview.isClosed ? (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <p className="font-medium">{t('accounting.dayClose.closed')}</p>
                  <p className="mt-1 text-xs">
                    {t('accounting.dayClose.counted')}: <span className="font-semibold">{formatMoney(preview.countedCash)}</span>
                    {' · '}
                    {t('accounting.dayClose.difference')}: <span className="font-semibold">{formatMoney(preview.difference)}</span>
                  </p>
                  <p className="mt-1 text-xs">
                    {preview.closedBy?.name || '—'} · {preview.closedAt ? formatDate(preview.closedAt) : '—'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.dayClose.countedCash')}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      disabled={!canManage}
                      placeholder="0.00"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.dayClose.notes')}</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={!canManage}
                      rows={2}
                      maxLength={500}
                      className={inputCls}
                    />
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={closeStatus === 'loading'}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    >
                      {closeStatus === 'loading' ? t('accounting.dayClose.closing') : t('accounting.dayClose.close')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title={t('accounting.dayClose.history')}>
            {dayCloses.status === 'loading' ? (
              <Spinner label={t('accounting.loading')} />
            ) : dayCloses.items.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {dayCloses.items.map((dc) => (
                  <div key={dc._id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatDate(dc.date)}</span>
                      <span className={`text-xs font-semibold ${Number(dc.difference) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {t('accounting.dayClose.difference')}: {formatMoney(dc.difference)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {t('accounting.dayClose.counted')}: <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(dc.countedCash)}</span>
                        {' · '}
                        {dc.closedBy?.name || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}