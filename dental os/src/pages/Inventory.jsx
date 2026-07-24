import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Spinner from '../components/ui/Spinner';
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
import { showErrorDialog } from '../features/ui/uiSlice';
import { deleteItem } from '../features/inventory/inventorySlice';
import { INVENTORY_CATEGORIES } from '../features/inventory/inventory';
import { formatDate, formatMoney } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';
import { canManageInventory } from '../lib/roles';

export default function Inventory() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, pagination, stats, query, status, error } = useSelector((s) => s.inventory);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const canManage = canManageInventory();

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
    if (!window.confirm(t('inventory.deleteConfirm'))) return;
    try {
      await dispatch(deleteItem(id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('inventory.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('inventory.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('inventory.new')}
          </button>
        )}
      </header>

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
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <select
            value={query.category}
            onChange={(e) => dispatch(setCategoryFilter(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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

        {isLoading && <div className="px-5 py-16"><Spinner label={t('inventory.loading')} /></div>}
        {error && !isLoading && <div className="px-5 py-16"><EmptyState title={t('inventory.loadFailed')} message={error?.message} /></div>}
        {status === 'succeeded' && !error && items.length === 0 && <div className="px-5 py-16"><EmptyState title={t('inventory.empty')} /></div>}

        {status === 'succeeded' && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  <th className="px-5 py-3">{t('inventory.col.name')}</th>
                  <th className="px-5 py-3">{t('inventory.col.category')}</th>
                  <th className="px-5 py-3">{t('inventory.col.quantity')}</th>
                  <th className="px-5 py-3">{t('inventory.col.reorder')}</th>
                  <th className="px-5 py-3">{t('inventory.col.expiry')}</th>
                  <th className="px-5 py-3">{t('inventory.col.cost')}</th>
                  <th className="px-5 py-3 text-end">{t('patients.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {items.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
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
                            <button type="button" onClick={() => setAdjustItem(item)} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15">
                              {t('inventory.adjust.button')}
                            </button>
                            <button type="button" onClick={() => openEdit(item)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                              {t('common.edit')}
                            </button>
                            <button type="button" onClick={() => onDelete(item._id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                              {t('common.archive')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status === 'succeeded' && !error && items.length > 0 && pagination.pages > 1 && (
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            pageSize={pagination.limit}
            onChange={(p) => dispatch(setPage(p))}
            prevLabel={t('common.prev')}
            nextLabel={t('common.next')}
          />
        )}
      </Card>

      <ItemFormModal open={formOpen} onClose={closeForm} item={editing} />
      <AdjustStockModal open={Boolean(adjustItem)} onClose={() => setAdjustItem(null)} item={adjustItem} />
    </div>
  );
}
