import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Field';
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

  return (
    <Modal
      open={open}
      title={t('billing.voidTitle')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="void-form"
            variant="danger"
            disabled={loading || !reason.trim()}
          >
            {loading ? t('common.saving') : t('billing.voidConfirmSubmit')}
          </Button>
        </>
      }
    >
      <form id="void-form" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('billing.voidConfirm', { no: invoice?.invoiceNo || '' })}
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('billing.voidReason')} <span className="text-red-500">*</span>
          </span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('billing.voidReasonPlaceholder')}
            className="resize-none"
          />
        </label>
        {loading && <Spinner label={t('common.saving')} />}
      </form>
    </Modal>
  );
}
