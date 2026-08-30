import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import toast from 'react-hot-toast';
import {
  fetchAppointments,
  fetchQueue,
  setDate,
  transitionAppointment,
  upsertFromSocket,
  upsertQueueFromSocket,
  callNextPatient,
} from './appointmentSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useSocket } from '../../hooks/useSocket';
import { subscribeQueue, unsubscribeQueue } from '../../lib/socket';
import QueueCard from './QueueCard';
import VisitPanel from './VisitPanel';
import EmptyState from '../../components/ui/EmptyState';
import { useT } from '../../lib/i18n';
import { canTransition } from './statuses';

const QUEUE_RANK = { checked_in: 0, in_progress: 1, confirmed: 2, scheduled: 3, no_show: 4, completed: 5, cancelled: 6 };
const POLL_INTERVAL = 30000;

const COLUMN_DEFS_RAW = [
  { key: 'checked_in', color: 'border-t-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', countColor: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-400' },
  { key: 'in_progress', color: 'border-t-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', countColor: 'text-violet-600 dark:text-violet-400', dotColor: 'bg-violet-400' },
  { key: 'scheduled', color: 'border-t-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10', countColor: 'text-sky-600 dark:text-sky-400', dotColor: 'bg-sky-400' },
  { key: 'completed', color: 'border-t-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', countColor: 'text-emerald-600 dark:text-emerald-400', dotColor: 'bg-emerald-400' },
];

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export default function LiveQueue() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, query, queue, queueStatus, callStatus } = useSelector((s) => s.appointments);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['checked_in', 'in_progress', 'scheduled', 'completed']));
  const [nextDoctor, setNextDoctor] = useState('');
  const isMobile = useIsMobile();
  const queryRef = useRef(query);
  queryRef.current = query;

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

  useEffect(() => {
    subscribeQueue();
    return () => unsubscribeQueue();
  }, []);

  const refetch = useCallback(() => {
    const q = queryRef.current;
    if (q.date) {
      dispatch(fetchAppointments({ ...q, date: q.date, limit: 200 }));
    }
    dispatch(fetchQueue());
  }, [dispatch]);

  const socketEvents = useMemo(
    () => [
      ['appointment:statusChanged', (payload) => dispatch(upsertFromSocket(payload.appointment))],
      ['appointment:updated', (payload) => dispatch(upsertFromSocket(payload.appointment))],
      ['appointment:created', (payload) => dispatch(upsertFromSocket(payload.appointment))],
      ['queue.status.changed', (payload) => dispatch(upsertQueueFromSocket(payload.appointment))],
      ['queue.patient.called', (payload) => dispatch(upsertQueueFromSocket(payload.appointment))],
    ],
    [dispatch],
  );
  useSocket(socketEvents);

  useEffect(() => {
    const id = setInterval(refetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  // Merge today's list appointments with the live /appointments/queue payload
  // so drag handles + lookup stay consistent on a single, deduped array.
  const boardItems = useMemo(() => {
    const map = new Map();
    [...items, ...(Array.isArray(queue.waiting) ? queue.waiting : []), ...(Array.isArray(queue.inChair) ? queue.inChair : [])].forEach((a) => {
      if (a && a._id) map.set(a._id, a);
    });
    return Array.from(map.values());
  }, [items, queue.waiting, queue.inChair]);

  const activeQueue = useMemo(() => {
    return boardItems
      .filter((a) => !['cancelled', 'no_show'].includes(a.status))
      .sort((a, b) => (QUEUE_RANK[a.status] ?? 99) - (QUEUE_RANK[b.status] ?? 99) || new Date(a.start) - new Date(b.start));
  }, [boardItems]);

  const byColumn = useMemo(() => {
    const map = { checked_in: [], in_progress: [], scheduled: [], completed: [] };
    activeQueue.forEach((a) => {
      if (map[a.status]) map[a.status].push(a);
      else if (a.status === 'confirmed') map.scheduled.push(a);
    });
    return map;
  }, [activeQueue]);

  const totalCount = activeQueue.length;

  const COLUMN_DEFS = COLUMN_DEFS_RAW;

  const labelMap = useMemo(() => ({
    checked_in: t('appointments.queue.colCheckedIn'),
    in_progress: t('appointments.queue.colInProgress'),
    scheduled: t('appointments.queue.colWaiting'),
    completed: t('appointments.queue.colCompleted'),
  }), [t]);

  const doctorOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    boardItems.forEach((a) => {
      if (a.doctor && !seen.has(a.doctor._id)) {
        seen.add(a.doctor._id);
        list.push(a.doctor);
      }
    });
    return list;
  }, [boardItems]);

  const handleCallNext = useCallback(async () => {
    const body = nextDoctor ? { doctor: nextDoctor } : {};
    try {
      const appointment = await dispatch(callNextPatient(body)).unwrap();
      toast.success(
        appointment?.patient
          ? `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim()
          : t('appointments.queue.called'),
      );
      if (appointment) dispatch(upsertQueueFromSocket(appointment));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, nextDoctor, t]);

  const onDragEnd = useCallback(
    async (result) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      const targetStatus = destination.droppableId;
      const appt = boardItems.find((a) => a._id === draggableId);
      if (!appt) return;

      const fromStatus = source.droppableId === 'scheduled' ? (appt.status === 'confirmed' ? 'confirmed' : 'scheduled') : source.droppableId;

      if (fromStatus === targetStatus) return;

      if (!canTransition(fromStatus, targetStatus)) {
        dispatch(showErrorDialog({ message: t('appointments.queue.invalidTransition') || 'This status transition is not allowed' }));
        return;
      }

      try {
        const updated = await dispatch(transitionAppointment({ id: draggableId, status: targetStatus })).unwrap();
        dispatch(upsertQueueFromSocket(updated));
      } catch (err) {
        dispatch(showErrorDialog(err));
      }
    },
    [boardItems, dispatch, t],
  );

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (status === 'loading' || status === 'idle') {
    return <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{t('appointments.queue.loading')}</div>;
  }

  const selectCls =
    'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">{t('appointments.queue.title')}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            {t('appointments.queue.subtitle')}
            <span className="ms-1.5 font-medium text-slate-700 dark:text-slate-300">({totalCount})</span>
            <span className="ms-3 font-medium text-emerald-600 dark:text-emerald-400">
              {t('appointments.queue.completedToday')}: {queue.completedToday}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {doctorOptions.length > 0 && (
              <select value={nextDoctor} onChange={(e) => setNextDoctor(e.target.value)} className={selectCls} aria-label={t('appointments.allDoctors')}>
                <option value="">{t('appointments.allDoctors')}</option>
                {doctorOptions.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleCallNext}
              disabled={callStatus === 'loading'}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400 sm:text-sm"
            >
              {callStatus === 'loading' ? t('appointments.queue.calling') : t('appointments.queue.callNext')}
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {t('appointments.queue.live')}
          </span>
        </div>
      </div>

      {queueStatus === 'failed' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('appointments.queue.queueLoadFailed')}</p>
      )}

      {activeQueue.length === 0 && queue.completedToday === 0 ? (
        <EmptyState title={t('appointments.queue.empty')} message={t('appointments.queue.emptyHint')} />
      ) : isMobile ? (
        <div className="space-y-2">
          {COLUMN_DEFS.map((col) => {
            const colItems = byColumn[col.key] || [];
            const isExpanded = expandedSections.has(col.key);
            return (
              <div key={col.key} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => toggleSection(col.key)}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition ${col.bg}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                    <span className={`text-sm font-semibold ${col.countColor}`}>{labelMap[col.key]}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                      {colItems.length}
                    </span>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="space-y-1.5 bg-white p-2 dark:bg-slate-900">
                    {colItems.length === 0 ? (
                      <p className="py-3 text-center text-xs text-slate-300 dark:text-slate-600">
                        {t('appointments.queue.emptyCol')}
                      </p>
                    ) : (
                      colItems.map((a) => (
                        <QueueCard
                          key={a._id}
                          appointment={a}
                          onClick={setSelectedAppt}
                          compact
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            {COLUMN_DEFS.map((col) => (
              <div key={col.key} className={`max-h-[calc(100vh-19rem)] overflow-y-auto rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/50 ${col.color} border-t-2 xl:p-3`}>
                <div className="mb-2.5 flex items-center justify-between xl:mb-3">
                  <h3 className={`text-xs font-semibold xl:text-sm ${col.countColor}`}>{labelMap[col.key]}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                    {(byColumn[col.key] || []).length}
                  </span>
                </div>
                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[36px] space-y-2 rounded-lg transition-colors xl:min-h-[40px] xl:space-y-3 ${
                        snapshot.isDraggingOver ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : ''
                      }`}
                    >
                      {(byColumn[col.key] || []).length === 0 && !snapshot.isDraggingOver ? (
                        <p className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] text-slate-300 dark:border-slate-700 dark:text-slate-600 xl:py-4 xl:text-xs">
                          {t('appointments.queue.emptyCol')}
                        </p>
                      ) : (
                        (byColumn[col.key] || []).map((a, index) => (
                          <Draggable key={a._id} draggableId={a._id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                              >
                                <QueueCard
                                  appointment={a}
                                  onClick={setSelectedAppt}
                                  isDragging={dragSnapshot.isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      <VisitPanel
        open={Boolean(selectedAppt)}
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
      />
    </div>
  );
}