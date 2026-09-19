import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';
import { showErrorDialog } from '../ui/uiSlice';
import { recordPayment, resetPaymentState } from './billingSlice';
import { PAYMENT_METHODS, paymentMethodTKey } from './statuses';
import { formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';

function round2(n) {
  const x = Number(n) || 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export default function PaymentModal({ open, invoice, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { paymentStatus } = useSelector((s) => s.billing);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const balance = invoice ? round2(invoice.balance ?? invoice.total - invoice.paidAmount) : 0;
  const maxPayment = Math.max(balance, 0);

  useEffect(() => {
    if (!open) return;
    setAmount(maxPayment > 0 ? String(maxPayment) : '');
    setMethod('cash');
    setReference('');
    setNotes('');
    dispatch(resetPaymentState());
  }, [open, maxPayment, dispatch]);

  const submitting = paymentStatus === 'loading';

  const labelCls = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200';

  const onSubmit = async (e) => {
    e.preventDefault();
    const value = round2(amount);
    if (!Number.isFinite(value) || value <= 0) {
      dispatch(showErrorDialog({ message: t('billing.payment.invalidAmount') }));
      return;
    }
    if (value > maxPayment + 0.005) {
      dispatch(showErrorDialog({ message: t('billing.payment.exceedsBalance') }));
      return;
    }
    try {
      await dispatch(recordPayment({ id: invoice._id, payload: { amount: value, method, reference: reference.trim() || undefined, notes: notes.trim() || undefined } })).unwrap();
      onSaved?.();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  if (!invoice) return null;

  return (
    <Modal
      open={open}
      title={t('billing.payment.title', { no: invoice.invoiceNo })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="payment-form" disabled={submitting}>
            {submitting ? t('common.saving') : t('billing.payment.submit')}
          </Button>
        </>
      }
    >
      {paymentStatus === 'loading' && (
        <div className="mb-3"><Spinner label={t('common.saving')} /></div>
      )}

      <form id="payment-form" onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-slate-600 dark:text-slate-300">{t('billing.payment.invoiceTotal')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(invoice.total)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-slate-600 dark:text-slate-300">{t('billing.payment.paidSoFar')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(invoice.paidAmount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <span className="font-medium text-slate-900 dark:text-white">{t('billing.payment.outstandingBalance')}</span>
            <span className="font-semibold text-red-600 dark:text-red-400">{formatMoney(balance)}</span>
          </div>
        </div>

        <label className="block">
          <span className={labelCls}>{t('billing.payment.amount')} <span className="text-red-500">*</span></span>
          <TextInput
            type="number"
            min="0.01"
            max={maxPayment}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className={labelCls}>{t('billing.payment.method')}</span>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{t(paymentMethodTKey(m))}</option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className={labelCls}>{t('billing.payment.reference')}</span>
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('billing.payment.referencePlaceholder')} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('billing.payment.notes')}</span>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('billing.payment.notesPlaceholder')} />
        </label>
      </form>
    </Modal>
  );
}
