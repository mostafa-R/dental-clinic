import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDashboardStats } from '../features/dashboard/dashboardSlice';
import BranchesList from '../features/dashboard/BranchesList';
import ModulesGrid from '../features/dashboard/ModulesGrid';
import RecentActivity from '../features/dashboard/RecentActivity';
import StaffByRole from '../features/dashboard/StaffByRole';
import AppointmentQueue from '../features/dashboard/AppointmentQueue';
import StatCards from '../features/dashboard/StatCards';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { RefreshIcon } from '../components/ui/icons';
import { formatDate, greetingFor } from '../lib/format';
import { useT } from '../lib/i18n';

export default function Dashboard() {
  const dispatch = useDispatch();
  const { stats, status, error } = useSelector((s) => s.dashboard);
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();

  const isLoading = status === 'loading' || status === 'idle';

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchDashboardStats());
    }
  }, [dispatch, status]);

  const onRefresh = () => dispatch(fetchDashboardStats());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {t('dashboard.greeting', { greeting: t(greetingFor()), name: user?.name?.split(' ')[0] || '' })}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(new Date())}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshIcon width={16} height={16} className={isLoading ? 'animate-spin' : ''} />
          {t('dashboard.refresh')}
        </button>
      </header>

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
              onClick={onRefresh}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
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
            <Card title={t('dashboard.staffByRole')}>
              <StaffByRole staffByRole={stats.staffByRole} />
            </Card>
            <Card title={t('dashboard.appointmentQueue')}>
              <AppointmentQueue queueByStatus={stats.queueByStatus} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title={t('dashboard.branches')}>
              <BranchesList branches={stats.branches} />
            </Card>
            <Card title={t('dashboard.modules')} className="lg:col-span-2">
              <ModulesGrid modules={stats.modules} />
            </Card>
          </div>

          <Card title={t('dashboard.recentActivity')}>
            <RecentActivity recentStaff={stats.recentStaff} />
          </Card>
        </>
      )}
    </div>
  );
}
