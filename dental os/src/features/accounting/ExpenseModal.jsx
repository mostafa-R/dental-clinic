import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import { createExpense, resetFormState } from './accountingSlice';
import { showErrorDialog } from '../ui/uiSlice';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
} from './accounting';
import { useT } from '../../lib/i18n';

export default function ExpenseModal({ open, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.accounting.formStatus);

  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  useEffect(() => {
    if (open) {
      setCategory(EXPENSE_CATEGORIES[0]);
      setDescription('');
      setAmount('');
      setDate('');
      setPaymentMethod('cash');
      dispatch(resetFormState());
    }
  }, [open, dispatch]);

  const submit = async () => {
    if (!description.trim() || !amount) {
      dispatch(showErrorDialog({ message: t('accounting.needFields') }));
      return;
    }
    try {
      await dispatch(
        createExpense({
          category,
          description: description.trim(),
          amount: Number(amount),
          date: date ? new Date(date).toISOString() : undefined,
          paymentMethod,
        }),
      ).unwrap();
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
      title={t('accounting.expense.new')}
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('accounting.expense.category')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`accounting.category.${c}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('accounting.expense.paymentMethod')}</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{t(`accounting.payment.${m}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('accounting.expense.description')}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} maxLength={300} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('accounting.amount')}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('accounting.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
