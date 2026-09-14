import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../appointments/StatusBadge';
import { appointmentApi } from '../appointments/appointmentApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { billingApi } from '../billing/billingApi';
import { useSocketEvent } from '../../lib/socket';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hasAccess(permissions, module) {
  return Boolean(permissions?.isSystemAdmin || permissions?.permissions?.[module]?.includes('read'));
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
}

function Row({ appointment, action, t }) {
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <time className="w-14 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{formatTime(appointment.start)}</time>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{appointment.patient?.fullName || t('appointments.patientFallback')}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{appointment.doctor?.name || t('appointments.doctorFallback')}{appointment.chair ? ` · ${appointment.chair}` : ''}</p>
      </div>
      <StatusBadge status={appointment.status} />
      {action}
    </li>
  );
}

export default function ClinicOperations() {
  const { t } = useT();
  const navigate = useNavigate();
  const permissions = useSelector((s) => s.users.myPermissions);
  const canAppointments = hasAccess(permissions, 'appointments');
  const canEmr = hasAccess(permissions, 'emr');
  const canInventory = hasAccess(permissions, 'inventory');
  const canBilling = hasAccess(permissions, 'billing');
  const [appointments, setAppointments] = useState(null);
  const [queue, setQueue] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [aging, setAging] = useState(null);

  const refreshAppointments = useCallback(() => {
    if (canAppointments) {
      appointmentApi.list({ date: today(), limit: 200 }).then((data) => setAppointments(data.appointments || [])).catch(() => setAppointments([]));
      appointmentApi.queue().then((data) => setQueue(data || { waiting: [], inChair: [] })).catch(() => setQueue({ waiting: [], inChair: [] }));
    }
  }, [canAppointments]);
  const refreshInventory = useCallback(() => {
    if (canInventory) inventoryApi.list({ lowStock: 'true', limit: 5 }).then((data) => setLowStock(data.items || [])).catch(() => setLowStock([]));
  }, [canInventory]);
  const refreshBilling = useCallback(() => {
    if (canBilling) billingApi.aging().then((data) => setAging(data.invoices || [])).catch(() => setAging([]));
  }, [canBilling]);

  useEffect(() => { refreshAppointments(); }, [refreshAppointments]);
  useEffect(() => { refreshInventory(); }, [refreshInventory]);
  useEffect(() => { refreshBilling(); }, [refreshBilling]);
  useSocketEvent('appointment:created', refreshAppointments);
  useSocketEvent('appointment:updated', refreshAppointments);
  useSocketEvent('appointment:statusChanged', refreshAppointments);
  useSocketEvent('queue.status.changed', refreshAppointments);
  useSocketEvent('invoice:updated', refreshBilling);
  useSocketEvent('inventory:updated', refreshInventory);

  const arrivals = useMemo(() => (appointments || []).filter((a) => ['scheduled', 'confirmed'].includes(a.status)).sort((a, b) => new Date(a.start) - new Date(b.start)), [appointments]);
  const alerts = useMemo(() => (appointments || []).filter((a) => a.lateArrival?.flagged || a.status === 'no_show').sort((a, b) => new Date(a.start) - new Date(b.start)), [appointments]);
  const waiting = queue?.waiting || [];
  const occupied = queue?.inChair || [];
  const outstanding = useMemo(() => (aging || [])
    .map((invoice) => ({ invoice, amount: Math.max(0, Number(invoice.total || 0) - Number(invoice.paidAmount || 0)) }))
    .filter(({ amount }) => amount > 0)
    .slice(0, 5), [aging]);

  if (!canAppointments && !canInventory && !canBilling) return null;

  return (
    <section className="space-y-4" aria-label="Today's clinic operations">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-light">Clinic operations</p><h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Today at a glance</h2></div>
        {canAppointments && <Link to="/appointments?tab=queue" className="text-sm font-medium text-brand hover:underline dark:text-brand-light">Open live queue</Link>}
      </div>
      {canAppointments && <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-700">
        {[["Arrivals", arrivals.length], ["Waiting", waiting.length], ["In chair", occupied.length], ["Late / no-show", alerts.length]].map(([label, count]) => <div key={label} className="bg-white px-4 py-3 dark:bg-slate-900"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{count}</p></div>)}
      </div>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {canAppointments && <Card title="Today's arrivals" action={<Link className="text-xs font-medium text-brand" to="/appointments">Schedule</Link>}>
          {appointments === null ? <p className="text-sm text-slate-400">Loading...</p> : arrivals.length ? <ul>{arrivals.slice(0, 6).map((a) => <Row key={a._id} appointment={a} t={t} action={canEmr && a.patient?._id ? <button type="button" onClick={() => navigate(`/patients/${a.patient._id}/emr`)} className="text-xs font-medium text-brand">Open</button> : null} />)}</ul> : <EmptyState title="No more arrivals scheduled" />}
        </Card>}
        {canAppointments && <Card title="Waiting patients" action={<Link className="text-xs font-medium text-brand" to="/appointments?tab=queue">Manage queue</Link>}>
          {queue === null ? <p className="text-sm text-slate-400">Loading...</p> : waiting.length ? <ul>{waiting.slice(0, 6).map((a) => <Row key={a._id} appointment={a} t={t} action={canEmr && a.patient?._id ? <button type="button" onClick={() => navigate(`/patients/${a.patient._id}/emr`)} className="text-xs font-medium text-brand">Open EMR</button> : null} />)}</ul> : <EmptyState title="No patients waiting" />}
        </Card>}
        {canAppointments && <Card title="Late and no-show alerts" accent="amber">
          {appointments === null ? <p className="text-sm text-slate-400">Loading...</p> : alerts.length ? <ul>{alerts.slice(0, 6).map((a) => <Row key={a._id} appointment={a} t={t} action={<span className="text-xs font-medium text-amber-700 dark:text-amber-300">{a.status === 'no_show' ? 'No-show' : `${a.lateArrival.minutesLate || 0}m late`}</span>} />)}</ul> : <EmptyState title="No late or no-show alerts" />}
        </Card>}
        {canInventory && <Card title="Low stock" accent="rose" action={<Link className="text-xs font-medium text-brand" to="/inventory">Inventory</Link>}>
          {lowStock === null ? <p className="text-sm text-slate-400">Loading...</p> : lowStock.length ? <ul>{lowStock.map((item) => <li key={item._id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0 dark:border-slate-800"><div><p className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">Reorder at {item.reorderPoint}</p></div><span className="text-sm font-semibold text-rose-700 dark:text-rose-300">{item.quantity} {item.unit}</span></li>)}</ul> : <EmptyState title="Stock levels are healthy" />}
        </Card>}
        {canBilling && <Card title="Outstanding balances" action={<Link className="text-xs font-medium text-brand" to="/billing">Billing</Link>}>
          {aging === null ? <p className="text-sm text-slate-400">Loading...</p> : outstanding.length ? <ul>{outstanding.map(({ invoice, amount }) => <li key={invoice._id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0 dark:border-slate-800"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900 dark:text-white">{invoice.patient?.fullName || `${invoice.patient?.firstName || ''} ${invoice.patient?.lastName || ''}`.trim() || invoice.invoiceNo}</p><p className="text-xs text-slate-500 dark:text-slate-400">{invoice.invoiceNo}</p></div><span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{formatMoney(amount)}</span></li>)}</ul> : <EmptyState title="No outstanding balances" />}
        </Card>}
      </div>
    </section>
  );
}
