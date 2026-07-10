import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import { adjustStock, resetFormState } from './inventorySlice';
import { showErrorDialog } from '../ui/uiSlice';
import { STOCK_TX_TYPES } from '../../lib/inventory';
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

  const submit = async () => {
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
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <Modal
      open={open}
      title={t('inventory.adjust.title', { name: item?.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={formStatus === 'loading'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
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
      </div>
    </Modal>
  );
}
