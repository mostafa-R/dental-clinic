import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { createItem, resetFormState, updateItem } from './inventorySlice';
import { showErrorDialog } from '../ui/uiSlice';
import { INVENTORY_CATEGORIES, INVENTORY_UNITS } from './inventory';
import { useT } from '../../lib/i18n';

export default function ItemFormModal({ open, onClose, item }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.inventory.formStatus);
  const user = useSelector((s) => s.auth.user);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'other',
    unit: 'unit',
    quantity: '',
    reorderPoint: '5',
    costPerUnit: '',
    expiryDate: '',
    supplier: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    dispatch(resetFormState());
    if (item) {
      setForm({
        name: item.name || '',
        sku: item.sku || '',
        category: item.category || 'other',
        unit: item.unit || 'unit',
        quantity: '',
        reorderPoint: String(item.reorderPoint ?? 5),
        costPerUnit: String(item.costPerUnit || ''),
        expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '',
        supplier: item.supplier || '',
        notes: item.notes || '',
      });
    } else {
      setForm({
        name: '', sku: '', category: 'other', unit: 'unit',
        quantity: '', reorderPoint: '5', costPerUnit: '',
        expiryDate: '', supplier: '', notes: '',
      });
    }
  }, [open, item, dispatch]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) {
      dispatch(showErrorDialog({ message: t('inventory.needName') }));
      return;
    }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      category: form.category,
      unit: form.unit,
      reorderPoint: Number(form.reorderPoint) || 0,
      costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : 0,
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
      supplier: form.supplier.trim() || undefined,
      notes: form.notes.trim() || undefined,
      branch: user?.branch?._id || user?.branch || undefined,
    };
    if (!item) {
      payload.quantity = form.quantity ? Number(form.quantity) : 0;
    }
    try {
      if (item) {
        await dispatch(updateItem({ id: item._id, payload })).unwrap();
      } else {
        await dispatch(createItem(payload)).unwrap();
      }
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  return (
    <Modal
      open={open}
      title={item ? t('inventory.form.edit') : t('inventory.form.new')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-form" disabled={formStatus === 'loading'}>
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.name')} *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.sku')}</label>
            <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.category')}</label>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{t(`inventory.category.${c}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.unit')}</label>
            <select value={form.unit} onChange={(e) => set('unit', e.target.value)} className={inputCls}>
              {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{t(`inventory.unit.${u}`)}</option>)}
            </select>
          </div>
          {!item && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.initialQty')}</label>
              <input value={form.quantity} onChange={(e) => set('quantity', e.target.value)} type="number" min="0" className={inputCls} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.reorderPoint')}</label>
            <input value={form.reorderPoint} onChange={(e) => set('reorderPoint', e.target.value)} type="number" min="0" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.costPerUnit')}</label>
            <input value={form.costPerUnit} onChange={(e) => set('costPerUnit', e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.expiryDate')}</label>
            <input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.supplier')}</label>
            <input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.form.notes')}</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
