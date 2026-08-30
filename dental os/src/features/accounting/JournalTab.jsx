import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { fetchJournal } from './accountingSlice';
import { formatDate, formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';

function dateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function JournalTab() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { journal } = useSelector((s) => s.accounting);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    dispatch(fetchJournal({ from: from || undefined, to: to || undefined, limit: 100 }));
  }, [dispatch, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const inputCls =
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  const balanced = journal.balances.totalDebit === journal.balances.totalCredit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.from')}</label>
          <input type="date" value={from} max={dateInputValue(new Date())} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('accounting.to')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {t('accounting.filter')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {t('accounting.journal.totalDebit')}: <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(journal.balances.totalDebit)}</span>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {t('accounting.journal.totalCredit')}: <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(journal.balances.totalCredit)}</span>
          </span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${balanced ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'}`}>
          {balanced ? t('accounting.journal.balanced') : t('accounting.journal.outOfBalance')}
        </span>
      </div>

      {journal.status === 'loading' && <Spinner label={t('accounting.loading')} />}
      {journal.status === 'failed' && <EmptyState title={t('accounting.loadFailed')} />}
      {journal.status === 'succeeded' && journal.entries.length === 0 && <EmptyState title={t('accounting.journal.empty')} />}
      {journal.status === 'succeeded' && journal.entries.length > 0 && (
        <Card padded={false}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="px-5 py-3">{t('accounting.journal.entryNo')}</th>
                <th className="px-5 py-3">{t('accounting.date')}</th>
                <th className="px-5 py-3">{t('accounting.journal.description')}</th>
                <th className="px-5 py-3 text-end">{t('accounting.journal.debit')}</th>
                <th className="px-5 py-3 text-end">{t('accounting.journal.credit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {journal.entries.map((entry) => (
                <tr key={entry._id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{entry.entryNo}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDate(entry.date)}</td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-200">{entry.description || '—'}</p>
                    <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700/40 dark:text-slate-400">
                      {t(`accounting.journal.source.${entry.sourceType}`)}
                    </span>
                    <div className="mt-1.5 space-y-1">
                      {(entry.lines || []).map((line, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="text-slate-600 dark:text-slate-300">{t(`accounting.journal.account.${line.account}`)}</span>
                          {line.memo && <span>· {line.memo}</span>}
                          <span className="ms-auto text-slate-700 dark:text-slate-200">
                            {line.debit ? `${t('accounting.journal.debit')} ${formatMoney(line.debit)}` : ''}
                            {line.credit ? `${t('accounting.journal.credit')} ${formatMoney(line.credit)}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-end font-medium text-slate-900 dark:text-white">{formatMoney(entry.totalDebit)}</td>
                  <td className="px-5 py-3 text-end font-medium text-slate-900 dark:text-white">{formatMoney(entry.totalCredit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}