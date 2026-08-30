import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';

function StatCard({ label, value, sub }) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </Card>
  );
}

export default function PlatformDashboard() {
  const dispatch = useDispatch();
  const { t } = useT();
  const [stats, setStats] = useState(null);
  const [growth, setGrowth] = useState([]);
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let active = true;
    (async () => {
      setStatus('loading');
      try {
        const [s, g, h] = await Promise.all([
          platformApi.getGlobalStats(),
          platformApi.getGrowth('6months'),
          platformApi.getHealth(),
        ]);
        if (!active) return;
        setStats(s);
        setGrowth(g.tenants || []);
        setHealth(h);
        setStatus('succeeded');
      } catch (err) {
        if (!active) return;
        setStatus('failed');
        dispatch(showErrorDialog(err));
      }
    })();
    return () => { active = false; };
  }, [dispatch]);

  if (status === 'loading' || status === 'idle') {
    return <Spinner label={t('site.dashboard.loading')} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.dashboard.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.dashboard.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('site.dashboard.totalTenants')} value={stats?.totalTenants ?? '—'} sub={t('site.dashboard.activeTenants', { count: stats?.activeTenants ?? 0 })} />
        <StatCard label={t('site.dashboard.totalPatients')} value={stats?.totalPatients ?? '—'} />
        <StatCard label={t('site.dashboard.totalAppointments')} value={stats?.totalAppointments ?? '—'} />
        <StatCard label={t('site.dashboard.mrr')} value={stats ? formatMoney(stats.monthlyRecurring) : '—'} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('site.dashboard.totalRevenue')} value={stats ? formatMoney(stats.totalRevenue) : '—'} />
        <StatCard label={t('site.dashboard.newTenantsThisMonth')} value={stats?.newTenantsThisMonth ?? '—'} />
        <StatCard label={t('site.dashboard.arpa')} value={stats ? formatMoney(stats.arpa) : '—'} />
        <StatCard label={t('site.dashboard.churnRate')} value={`${(stats?.churnRate ?? 0).toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('site.dashboard.growthTitle')}>
          {growth.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t('site.dashboard.noGrowth')}</p>
          ) : (
            <div className="flex h-48 items-end gap-2">
              {growth.map((p) => (
                <div key={p.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-500"
                    style={{ height: `${Math.max(6, (p.count / Math.max(...growth.map((x) => x.count))) * 150)}px` }}
                    title={p.count}
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.month.slice(2)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {health && (
          <Card title={t('site.dashboard.healthTitle')}>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('site.dashboard.status')}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${health.status === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'}`}>
                  {health.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('site.dashboard.mongodb')}</span>
                <span className="text-slate-900 dark:text-white">{health.mongodb?.status} ({health.mongodb?.latencyMs ?? '—'} ms)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('site.dashboard.redis')}</span>
                <span className="text-slate-900 dark:text-white">{health.redis?.connected ? 'connected' : 'disconnected'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('site.dashboard.uptime')}</span>
                <span className="text-slate-900 dark:text-white">{Math.floor((health.uptime ?? 0) / 60)} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('site.dashboard.memory')}</span>
                <span className="text-slate-900 dark:text-white">{health.memory?.heapUsed ?? '—'} MB</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}