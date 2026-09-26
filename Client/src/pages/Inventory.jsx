import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import StatCard from '../components/ui/StatCard';
import ItemFormModal from '../features/inventory/ItemFormModal';
import AdjustStockModal from '../features/inventory/AdjustStockModal';
import {
  fetchItems,
  resetInventory,
  setCategoryFilter,
  setLowStockFilter,
  setPage,
  setSearch,
} from '../features/inventory/inventorySlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { deleteItem } from '../features/inventory/inventorySlice';
import { INVENTORY_CATEGORIES } from '../features/inventory/inventory';
import { formatDate, formatMoney } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';
import { useCanManageInventory } from '../lib/roles';

export default function Inventory() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, pagination, stats, query, status, error } = useSelector((s) => s.inventory);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const canManage = useCanManageInventory();

  useEffect(() => {
    dispatch(fetchItems(query));
  }, [dispatch, query]);

  useEffect(() => () => dispatch(resetInventory()), [dispatch]);

  const refetch = useCallback(() => { dispatch(fetchItems(query)); }, [dispatch, query]);
  useSocketEvent('inventory:created', refetch);
  useSocketEvent('inventory:updated', refetch);
  useSocketEvent('inventory:deleted', refetch);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item) => { setEditing(item); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const onDelete = async (id) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('inventory.deleteConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await dispatch(deleteItem(id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t('inventory.deleted') }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              {t('inventory.new')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label={t('inventory.stats.totalItems')} value={pagination.total} />
        <StatCard label={t('inventory.stats.lowStock')} value={stats.lowStockCount} accent="amber" />
        <StatCard label={t('inventory.stats.stockValue')} value={formatMoney(stats.totalStockValue)} accent="emerald" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <input
            type="text"
            value={query.search}
            onChange={(e) => dispatch(setSearch(e.target.value))}
            placeholder={t('inventory.searchPlaceholder')}
            aria-label={t('inventory.searchPlaceholder')}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-brand-light"
          />
          <select
            value={query.category}
            onChange={(e) => dispatch(setCategoryFilter(e.target.value))}
            aria-label={t('inventory.categoryLabel')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-brand-light"
          >
            <option value="">{t('common.all')}</option>
            {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{t(`inventory.category.${c}`)}</option>)}
          </select>
          <button
            type="button"
            onClick={() => dispatch(setLowStockFilter(query.lowStock === 'true' ? undefined : 'true'))}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              query.lowStock === 'true'
                ? 'bg-amber-500 text-white'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {t('inventory.lowStockOnly')}
          </button>
        </div>

        {isLoading && (
          <DataTable
            columns={[
              { label: t('inventory.col.name') },
              { label: t('inventory.col.category') },
              { label: t('inventory.col.quantity') },
              { label: t('inventory.col.reorder') },
              { label: t('inventory.col.expiry') },
              { label: t('inventory.col.cost') },
              { label: t('patients.col.actions'), className: 'text-end' },
            ]}
            count={pagination.total}
            loading
          >
            {[]}
          </DataTable>
        )}
        {error && !isLoading && <div className="px-5 py-16"><EmptyState title={t('inventory.loadFailed')} message={error?.message} /></div>}
        {status === 'succeeded' && !error && items.length === 0 && <div className="px-5 py-16"><EmptyState title={t('inventory.empty')} /></div>}

        {status === 'succeeded' && !error && items.length > 0 && (
          <DataTable
            columns={[
              { label: t('inventory.col.name') },
              { label: t('inventory.col.category') },
              { label: t('inventory.col.quantity') },
              { label: t('inventory.col.reorder') },
              { label: t('inventory.col.expiry') },
              { label: t('inventory.col.cost') },
              { label: t('patients.col.actions'), className: 'text-end' },
            ]}
            count={pagination.total}
            footer={
              status === 'succeeded' && pagination.pages > 1 ? (
                <Pagination
                  page={pagination.page}
                  pages={pagination.pages}
                  total={pagination.total}
                  pageSize={pagination.limit}
                  onChange={(p) => dispatch(setPage(p))}
                  prevLabel={t('common.prev')}
                  nextLabel={t('common.next')}
                />
              ) : undefined
            }
          >
            {items.map((item) => (
              <tr key={item._id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3">
                  <div>
                    <span className="font-medium text-slate-900 dark:text-white">{item.name}</span>
                    {item.sku && <span className="ms-2 font-mono text-xs text-slate-400 dark:text-slate-500">{item.sku}</span>}
                  </div>
                </td>
                <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">{t(`inventory.category.${item.category}`)}</span></td>
                <td className="px-5 py-3">
                  <span className={`font-medium ${item.needsReorder ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                    {item.quantity}
                  </span>
                  <span className="ms-1 text-xs text-slate-400">{t(`inventory.unit.${item.unit}`)}</span>
                  {item.isExpired && <span className="ms-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">{t('inventory.expired')}</span>}
                </td>
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{item.reorderPoint}</td>
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{item.expiryDate ? formatDate(item.expiryDate) : '—'}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatMoney(item.costPerUnit)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {canManage && (
                      <>
                        <Button variant="ghost" size="xs" onClick={() => setAdjustItem(item)}>
                          {t('inventory.adjust.button')}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => openEdit(item)}>
                          {t('common.edit')}
                        </Button>
                        <Button variant="danger-soft" size="xs" onClick={() => onDelete(item._id)}>
                          {t('common.archive')}
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <ItemFormModal open={formOpen} onClose={closeForm} item={editing} />
      <AdjustStockModal open={Boolean(adjustItem)} onClose={() => setAdjustItem(null)} item={adjustItem} />
    </div>
  );
}
