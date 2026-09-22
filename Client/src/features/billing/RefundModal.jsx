import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';
import { refundPayment, resetPaymentState } from './billingSlice';
import { PAYMENT_METHODS, paymentMethodTKey } from './statuses';
import { showErrorDialog } from '../ui/uiSlice';
import { formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';

function round2(n) {
  const x = Number(n) || 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export default function RefundModal({ open, invoice, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { paymentStatus } = useSelector((s) => s.billing);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const maxRefund = invoice ? round2(invoice.paidAmount) : 0;

  useEffect(() => {
    if (!open) return;
    setAmount(maxRefund > 0 ? String(maxRefund) : '');
    setMethod('cash');
    setReference('');
    setNotes('');
    dispatch(resetPaymentState());
  }, [open, maxRefund, dispatch]);

  const submitting = paymentStatus === 'loading';

  const labelCls = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200';

  const onSubmit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0.01) {
      dispatch(showErrorDialog({ message: t('billing.refund.invalidAmount') }));
      return;
    }
    if (value > maxRefund + 0.01) {
      dispatch(showErrorDialog({ message: t('billing.refund.exceedsPaid') }));
      return;
    }
    try {
      await dispatch(
        refundPayment({
          id: invoice._id,
          payload: {
            amount: value,
            method,
            reference: reference.trim() || undefined,
            notes: notes.trim() || undefined,
          },
        }),
      ).unwrap();
      onSaved?.();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  if (!invoice) return null;

  return (
    <Modal
      open={open}
      title={t('billing.refund.title', { no: invoice.invoiceNo })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="refund-form" variant="danger" disabled={submitting}>
            {submitting ? t('common.saving') : t('billing.refund.submit')}
          </Button>
        </>
      }
    >
      {submitting && (
        <div className="mb-3"><Spinner label={t('common.saving')} /></div>
      )}

      <form id="refund-form" onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-slate-600 dark:text-slate-300">{t('billing.refund.invoiceTotal')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(invoice.total)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-slate-600 dark:text-slate-300">{t('billing.refund.paidAmount')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(invoice.paidAmount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <span className="font-medium text-slate-900 dark:text-white">{t('billing.refund.maxRefund')}</span>
            <span className="font-semibold text-red-600 dark:text-red-400">{formatMoney(maxRefund)}</span>
          </div>
        </div>

        <label className="block">
          <span className={labelCls}>{t('billing.refund.amount')} <span className="text-red-500">*</span></span>
          <TextInput
            type="number"
            min="0.01"
            step="0.01"
            max={maxRefund}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className={labelCls}>{t('billing.refund.method')}</span>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{t(paymentMethodTKey(m))}</option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className={labelCls}>{t('billing.refund.reference')}</span>
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('billing.refund.referencePlaceholder')} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('billing.refund.notes')}</span>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('billing.refund.notesPlaceholder')} />
        </label>
      </form>
    </Modal>
  );
}
