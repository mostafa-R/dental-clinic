import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { useT } from '../../lib/i18n';

export default function VoidConfirmModal({ open, invoice, onClose, onConfirm, loading }) {
  const { t } = useT();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open]);

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <Modal
      open={open}
      title={t('billing.voidTitle')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={loading || !reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400"
          >
            {loading ? t('common.saving') : t('billing.voidConfirmSubmit')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('billing.voidConfirm', { no: invoice?.invoiceNo || '' })}
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('billing.voidReason')} <span className="text-red-500">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('billing.voidReasonPlaceholder')}
            className={`${inputCls} resize-none`}
          />
        </label>
        {loading && <Spinner label={t('common.saving')} />}
      </div>
    </Modal>
  );
}
