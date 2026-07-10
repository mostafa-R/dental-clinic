import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../../hooks/useSocket';
import { fetchAppointments, setDate, upsertFromSocket } from './appointmentSlice';
import QueueCard from './QueueCard';
import VisitPanel from './VisitPanel';
import EmptyState from '../../components/ui/EmptyState';
import { useT } from '../../lib/i18n';

const QUEUE_RANK = { checked_in: 0, in_progress: 1, confirmed: 2, scheduled: 3, no_show: 4, completed: 5, cancelled: 6 };

export default function LiveQueue() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, query } = useSelector((s) => s.appointments);
  const [selectedAppt, setSelectedAppt] = useState(null);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    dispatch(setDate(today));
  }, [dispatch, today]);

  useEffect(() => {
    if (query.date) {
      dispatch(fetchAppointments({ ...query, date: query.date, limit: 200 }));
    }
  }, [dispatch, query]);

  const socketEvents = useMemo(
    () => [
      ['appointment:statusChanged', (payload) => dispatch(upsertFromSocket(payload.appointment))],
      ['appointment:updated', (payload) => dispatch(upsertFromSocket(payload.appointment))],
      ['appointment:created', (payload) => dispatch(upsertFromSocket(payload.appointment))],
    ],
    [dispatch],
  );
  useSocket(socketEvents);

  const activeQueue = useMemo(() => {
    return items
      .filter((a) => !['cancelled', 'no_show'].includes(a.status))
      .sort((a, b) => (QUEUE_RANK[a.status] ?? 99) - (QUEUE_RANK[b.status] ?? 99) || new Date(a.start) - new Date(b.start));
  }, [items]);

  const byColumn = useMemo(() => {
    const map = { checked_in: [], in_progress: [], scheduled: [], completed: [] };
    activeQueue.forEach((a) => {
      if (map[a.status]) map[a.status].push(a);
      else if (a.status === 'confirmed') map.scheduled.push(a);
    });
    return map;
  }, [activeQueue]);

  const totalCount = activeQueue.length;

  const COLUMNS = [
    { key: 'checked_in', label: t('appointments.queue.colCheckedIn'), color: 'text-amber-600 dark:text-amber-400' },
    { key: 'in_progress', label: t('appointments.queue.colInProgress'), color: 'text-violet-600 dark:text-violet-400' },
    { key: 'scheduled', label: t('appointments.queue.colWaiting'), color: 'text-sky-600 dark:text-sky-400' },
    { key: 'completed', label: t('appointments.queue.colCompleted'), color: 'text-emerald-600 dark:text-emerald-400' },
  ];

  if (status === 'loading' || status === 'idle') {
    return <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{t('appointments.queue.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('appointments.queue.title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('appointments.queue.subtitle')}
            <span className="ml-2 font-medium text-slate-700 dark:text-slate-300">({totalCount})</span>
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {t('appointments.queue.live')}
        </span>
      </div>

      {activeQueue.length === 0 ? (
        <EmptyState title={t('appointments.queue.empty')} message={t('appointments.queue.emptyHint')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${col.color}`}>{col.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {byColumn[col.key].length}
                </span>
              </div>
              <div className="max-h-[calc(100vh-16rem)] space-y-3 overflow-y-auto">
                {byColumn[col.key].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-xs text-slate-300 dark:border-slate-700 dark:text-slate-600">
                    {t('appointments.queue.emptyCol')}
                  </p>
                ) : (
                  byColumn[col.key].map((a) => (
                    <QueueCard key={a._id} appointment={a} onClick={setSelectedAppt} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Visit Panel */}
      <VisitPanel
        open={Boolean(selectedAppt)}
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
      />
    </div>
  );
}
