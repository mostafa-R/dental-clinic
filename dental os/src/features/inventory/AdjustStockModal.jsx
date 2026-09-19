import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { adjustStock, resetFormState } from './inventorySlice';
import { showErrorDialog } from '../ui/uiSlice';
import { STOCK_TX_TYPES } from './inventory';
import { useT } from '../../lib/i18n';

export default function AdjustStockModal({ open, onClose, item }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.inventory.formStatus);

  const [type, setType] = useState('stock_in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    dispatch(resetFormState());
    setType('stock_in');
    setQuantity('');
    setReason('');
  }, [open, dispatch]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!quantity || Number(quantity) <= 0) {
      dispatch(showErrorDialog({ message: t('inventory.needQuantity') }));
      return;
    }
    try {
      await dispatch(adjustStock({ id: item._id, payload: { type, quantity: Number(quantity), reason: reason.trim() || undefined } })).unwrap();
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
      title={t('inventory.adjust.title', { name: item?.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="adjust-form" disabled={formStatus === 'loading'}>
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('inventory.adjust.current')}: <strong className="text-slate-900 dark:text-white">{item?.quantity || 0}</strong></p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.adjust.type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {STOCK_TX_TYPES.map((tp) => <option key={tp} value={tp}>{t(`inventory.tx.${tp}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.adjust.quantity')}</label>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0.01" step="0.01" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('inventory.adjust.reason')}</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </div>
      </form>
    </Modal>
  );
}
