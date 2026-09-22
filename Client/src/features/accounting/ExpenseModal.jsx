import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
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

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      dispatch(showErrorDialog({ message: t('accounting.needFields') }));
      return;
    }
    try {
      await dispatch(
        createExpense({
          category,
          description: description.trim(),
          amount: Math.round((value + Number.EPSILON) * 100) / 100,
          date: date ? new Date(date).toISOString() : undefined,
          paymentMethod,
        }),
      ).unwrap();
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500';

  return (
    <Modal
      open={open}
      title={t('accounting.expense.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="expense-form" disabled={formStatus === 'loading'}>
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('accounting.expense.category')}</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`accounting.category.${c}`)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelCls}>{t('accounting.expense.paymentMethod')}</label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{t(`accounting.payment.${m}`)}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('accounting.expense.description')}</label>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('accounting.amount')}</label>
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" />
          </div>
          <div>
            <label className={labelCls}>{t('accounting.date')}</label>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
