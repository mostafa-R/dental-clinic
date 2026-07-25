import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDashboardStats } from '../features/dashboard/dashboardSlice';
import BranchesList from '../features/dashboard/BranchesList';
import ModulesGrid from '../features/dashboard/ModulesGrid';
import RecentActivity from '../features/dashboard/RecentActivity';
import StaffByRole from '../features/dashboard/StaffByRole';
import AppointmentQueue from '../features/dashboard/AppointmentQueue';
import StatCards from '../features/dashboard/StatCards';
import FinancialSummary from '../features/dashboard/owner/FinancialSummary';
import TodayCount from '../features/dashboard/doctor/TodayCount';
import PatientsCount from '../features/dashboard/doctor/PatientsCount';
import PendingEarnings from '../features/dashboard/doctor/PendingEarnings';
import Outstanding from '../features/dashboard/doctor/Outstanding';
import TodaySchedule from '../features/dashboard/doctor/TodaySchedule';
import ActivePlans from '../features/dashboard/doctor/ActivePlans';
import LowStock from '../features/dashboard/doctor/LowStock';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { RefreshIcon } from '../components/ui/icons';
import { formatDate, greetingFor } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';

function DoctorDashboard({ header }) {
  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TodayCount />
        <PatientsCount />
        <PendingEarnings />
        <Outstanding />
      </div>
      <TodaySchedule />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivePlans />
        <LowStock />
      </div>
    </div>
  );
}

function OwnerDashboard({ header }) {
  const dispatch = useDispatch();
  const { stats, status, error } = useSelector((s) => s.dashboard);
  const { t } = useT();

  const isLoading = status === 'loading' || status === 'idle';

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchDashboardStats());
    }
  }, [dispatch, status]);

  const refetch = useCallback(() => { dispatch(fetchDashboardStats()); }, [dispatch]);
  useSocketEvent('appointment:created', refetch);
  useSocketEvent('appointment:updated', refetch);
  useSocketEvent('patient:created', refetch);
  useSocketEvent('invoice:created', refetch);
  useSocketEvent('invoice:updated', refetch);

  return (
    <div className="space-y-6">
      {header}

      {isLoading && !stats && (
        <Card>
          <Spinner label={t('dashboard.loading')} />
        </Card>
      )}

      {error && !stats && (
        <Card>
          <EmptyState
            title={t('dashboard.loadFailed')}
            message={error}
          />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => dispatch(fetchDashboardStats())}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:from-indigo-500 dark:to-violet-500"
            >
              {t('common.tryAgain')}
            </button>
          </div>
        </Card>
      )}

      {stats && (
        <>
          <StatCards summary={stats.summary} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t('dashboard.staffByRole')} accent="indigo">
              <StaffByRole staffByRole={stats.staffByRole} />
            </Card>
            <Card title={t('dashboard.appointmentQueue')} accent="sky">
              <AppointmentQueue queueByStatus={stats.queueByStatus} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title={t('dashboard.branches')} accent="emerald">
              <BranchesList branches={stats.branches} />
            </Card>
            <Card title={t('dashboard.modules')} className="lg:col-span-2" accent="violet">
              <ModulesGrid modules={stats.modules} />
            </Card>
          </div>

          <FinancialSummary />

          <Card title={t('dashboard.recentActivity')} accent="indigo">
            <RecentActivity recentStaff={stats.recentStaff} />
          </Card>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const { status } = useSelector((s) => s.dashboard);
  const { t } = useT();

  const isPureDoctor = user?.role === 'doctor';
  const canSwitchDashboard = !isPureDoctor;
  const isLoading = status === 'loading' || status === 'idle';
  const [activeView, setActiveView] = useState(isPureDoctor ? 'doctor' : 'owner');

  useEffect(() => {
    if (isPureDoctor) setActiveView('doctor');
  }, [isPureDoctor]);

  const onRefresh = () => dispatch(fetchDashboardStats());

  const header = useMemo(() => (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300">
          {t('dashboard.greeting', { greeting: t(greetingFor()), name: user?.name?.split(' ')[0] || '' })}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{formatDate(new Date())}</p>
      </div>
      <div className="flex items-center gap-2">
        {canSwitchDashboard && (
          <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setActiveView('owner')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                activeView === 'owner'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 dark:from-indigo-500 dark:to-violet-500'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              {t('dashboard.viewOwner')}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('doctor')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                activeView === 'doctor'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25 dark:from-emerald-500 dark:to-teal-500'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 3v6a4 4 0 0 0 8 0V3" />
                <path d="M4 3h2M10 3h2" />
                <path d="M8 13v3a5 5 0 0 0 10 0v-2" />
                <circle cx="18" cy="11" r="2" />
              </svg>
              {t('dashboard.viewDoctor')}
            </button>
          </div>
        )}
        {!isPureDoctor && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshIcon width={15} height={15} className={isLoading ? 'animate-spin' : ''} />
            {t('dashboard.refresh')}
          </button>
        )}
      </div>
    </header>
  ), [t, user, canSwitchDashboard, activeView, isLoading, onRefresh]);

  if (isPureDoctor) return <DoctorDashboard header={header} />;

  return activeView === 'doctor'
    ? <DoctorDashboard header={header} />
    : <OwnerDashboard header={header} />;
}
