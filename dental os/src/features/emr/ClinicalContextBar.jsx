import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { emrApi } from './emrApi';
import { appointmentApi } from '../appointments/appointmentApi';
import { accountingApi } from '../accounting/accountingApi';
import { canViewBilling } from '../../lib/roles';
import { formatDate, formatMoney } from '../../lib/format';

function hasRead(permissions, module) { return Boolean(permissions?.isSystemAdmin || permissions?.permissions?.[module]?.includes('read')); }
function Chip({ label, value, tone = 'slate' }) {
  const tones = { slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200', amber: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100' };
  return <div className={`min-w-0 rounded-md border px-3 py-2 ${tones[tone]}`}><p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-0.5 truncate text-sm font-medium">{value || 'None recorded'}</p></div>;
}

export default function ClinicalContextBar({ patient }) {
  const navigate = useNavigate(); const permissions = useSelector((s) => s.users.myPermissions);
  const [plans, setPlans] = useState([]); const [wallet, setWallet] = useState(null); const [todayVisit, setTodayVisit] = useState(null);
  const canAppointments = hasRead(permissions, 'appointments'); const canBilling = canViewBilling();
  useEffect(() => {
    let active = true;
    emrApi.listPlans(patient._id, { status: 'active', limit: 100 }).then((data) => active && setPlans(data.plans || [])).catch(() => active && setPlans([]));
    if (canBilling) accountingApi.getWallet(patient._id).then((data) => active && setWallet(data.wallet || null)).catch(() => active && setWallet(null));
    if (canAppointments) { const d = new Date(); const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; appointmentApi.list({ date, patient: patient._id, limit: 10 }).then((data) => active && setTodayVisit((data.appointments || [])[0] || null)).catch(() => active && setTodayVisit(null)); }
    return () => { active = false; };
  }, [patient._id, canBilling, canAppointments]);
  const allergies = patient.medicalHistory?.allergies?.map((item) => item.name).filter(Boolean).join(', ');
  const conditions = patient.medicalHistory?.chronicConditions?.map((item) => item.name).filter(Boolean).join(', ');
  const planTotal = useMemo(() => plans.reduce((sum, plan) => sum + Number(plan.totalEstimated ?? 0), 0), [plans]);
  return <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Patient clinical context"><div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-light">Clinical context</p><div className="mt-1 flex flex-wrap items-baseline gap-x-2"><h1 className="text-xl font-semibold text-slate-900 dark:text-white">{patient.fullName}</h1><span className="font-mono text-xs text-slate-500 dark:text-slate-400">{patient.patientId}</span></div></div>{todayVisit && <button type="button" onClick={() => navigate('/appointments?tab=queue')} className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark">{todayVisit.status === 'checked_in' ? "Continue today's visit" : "Open today's visit"}</button>}</div><div className="grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 sm:px-5"><Chip label="Allergies" value={allergies} tone={allergies ? 'amber' : 'slate'} /><Chip label="Medical conditions" value={conditions} /><Chip label="Active treatment plans" value={plans.length ? `${plans.length} · ${formatMoney(planTotal)}` : 'None active'} /><Chip label="Wallet balance" value={canBilling && wallet ? formatMoney(wallet.balance) : 'Restricted'} /></div><div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:px-5"><span>Last record: {patient.updatedAt ? formatDate(patient.updatedAt) : 'Not available'}</span>{todayVisit && <span>Today: {todayVisit.status.replace('_', ' ')}{todayVisit.chair ? ` · ${todayVisit.chair}` : ''}</span>}</div></section>;
}
