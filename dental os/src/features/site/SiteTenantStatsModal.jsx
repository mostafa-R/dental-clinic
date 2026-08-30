import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { platformApi } from './platformApi';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatDate, formatMoney } from '../../lib/format';

export default function SiteTenantStatsModal({ tenant, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let active = true;
    (async () => {
      setStatus('loading');
      try {
        const result = await platformApi.getTenantStats(tenant._id);
        if (!active) return;
        setStats(result);
        setStatus('succeeded');
      } catch (err) {
        if (!active) return;
        setStatus('failed');
        dispatch(showErrorDialog(err));
      }
    })();
    return () => { active = false; };
  }, [dispatch, tenant._id]);

  const rows = stats
    ? [
        [t('site.tenantsStats.branches'), stats.branchesCount],
        [t('site.tenantsStats.users'), stats.usersCount],
        [t('site.tenantsStats.doctors'), stats.doctorsCount],
        [t('site.tenantsStats.patients'), stats.patientsCount],
        [t('site.tenantsStats.appointments'), stats.appointmentsCount],
        [t('site.tenantsStats.revenue'), formatMoney(stats.totalRevenue)],
      ]
    : [];

  return (
    <Modal open onClose={onClose} title={t('site.tenantsStats.title', { name: tenant.name })}>
      {status === 'loading' || status === 'idle' ? (
        <Spinner label={t('site.tenantsStats.loading')} />
      ) : status === 'failed' ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{t('site.tenantsStats.loadFailed')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-sm dark:bg-slate-800">
              <span className="text-slate-500 dark:text-slate-400">{label}</span>
              <span className="font-medium text-slate-900 dark:text-white">{value}</span>
            </div>
          ))}
          {stats?.planLimits && (
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('site.tenantsStats.limits')}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t('site.tenantsStats.maxBranches')}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{stats.planLimits.maxBranches}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t('site.tenantsStats.maxDoctors')}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{stats.planLimits.maxDoctors}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t('site.tenantsStats.maxPatients')}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{stats.planLimits.maxPatients}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t('site.tenantsStats.storage')}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{stats.planLimits.storageLimit} MB</span>
                </div>
              </div>
            </div>
          )}
          <p className="pt-2 text-xs text-slate-400 dark:text-slate-500">
            {t('site.tenantsStats.created', { date: formatDate(tenant.createdAt) })}
          </p>
        </div>
      )}
    </Modal>
  );
}