import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { doctorDashboardApi } from '../doctorDashboardApi';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import { useT } from '../../../lib/i18n';
import { formatNumber } from '../../../lib/format';

export default function LowStock() {
  const { t } = useT();
  const perms = useSelector((s) => s.users.myPermissions);
  const [items, setItems] = useState(null);

  const hasAccess = perms?.isSystemAdmin || perms?.permissions?.inventory?.includes('read');

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    doctorDashboardApi
      .getLowStock()
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => { cancelled = true; };
  }, [hasAccess]);

  if (!hasAccess) return null;

  return (
    <Card
      title={t('doctorDashboard.lowStock')}
      action={
        <Link
          to="/inventory"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {t('common.view')}
        </Link>
      }
    >
      {items === null && (
        <p className="py-4 text-center text-sm text-slate-400">{t('common.loading')}</p>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title={t('doctorDashboard.noLowStock')}
          message={t('doctorDashboard.noLowStockHint')}
        />
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.slice(0, 5).map((item) => (
            <li key={item._id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {item.name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t('inventory.category.' + item.category)} · {item.sku || '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                  {formatNumber(item.quantity)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {t('doctorDashboard.reorderAt')} {item.reorderPoint}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
