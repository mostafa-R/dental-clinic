import Modal from '../../components/ui/Modal';
import { statusStyle, statusTKey, paymentMethodTKey } from './statuses';
import { formatMoney, formatDate } from '../../lib/format';
import { canManageBilling, canVoidBilling } from '../../lib/roles';
import { useT } from '../../lib/i18n';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function formatDateSafe(d) {
  if (!d) return '—';
  return formatDate(d);
}

export default function InvoiceDetailModal({ open, invoice, onClose, onPay, onEdit, onVoid, onRefund }) {
  const { t } = useT();
  if (!invoice) return null;

  const balance = Number(invoice.balance ?? invoice.total - invoice.paidAmount);
  const canVoid = canVoidBilling() && invoice.status !== 'void';
  const canManage = canManageBilling();
  const canPay = canManage && invoice.status !== 'void' && balance > 0.001;
  const canEditInvoice = canManage && invoice.status !== 'void';
  const canRefund = canManage && invoice.status !== 'void' && invoice.paidAmount > 0.001;

  const isPercentage = invoice.discountType === 'percentage';
  const discountLabel = isPercentage
    ? `${formatMoney(invoice.discount)} (${invoice.discountRate}%)`
    : formatMoney(invoice.discount);
  const taxLabel = invoice.taxRate
    ? `${formatMoney(invoice.tax)} (${invoice.taxRate}%)`
    : formatMoney(invoice.tax);
  const isOverdue = invoice.isOverdue || (invoice.dueDate && invoice.status !== 'paid' && invoice.status !== 'void' && new Date(invoice.dueDate) < new Date());

  return (
    <Modal
      open={open}
      title={`${t('billing.col.invoice')} ${invoice.invoiceNo}`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit?.(invoice)}
            disabled={!canEditInvoice}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.edit')}
          </button>
          {canVoid && (
            <button
              type="button"
              onClick={() => onVoid?.(invoice)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/15"
            >
              {t('billing.void')}
            </button>
          )}
          {canPay && (
            <button
              type="button"
              onClick={() => onPay?.(invoice)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {t('billing.pay')}
            </button>
          )}
          {canRefund && (
            <button
              type="button"
              onClick={() => onRefund?.(invoice)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/15"
            >
              {t('billing.detail.refund')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('billing.col.patient')}</p>
            <p className="font-medium text-slate-900 dark:text-white">{invoice.patient?.fullName || '—'}</p>
            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{invoice.patient?.patientId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOverdue && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700">
                {t('billing.detail.overdue')}
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusStyle(invoice.status)}`}>
              {t(statusTKey(invoice.status))}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                <th className="px-3 py-2 font-medium">{t('billing.form.description')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('billing.form.qty')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('billing.form.unitPrice')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('billing.form.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {invoice.items?.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{it.description}</td>
                  <td className="px-3 py-2 text-end text-slate-600 dark:text-slate-300">{it.quantity}</td>
                  <td className="px-3 py-2 text-end text-slate-600 dark:text-slate-300">{formatMoney(it.unitPrice)}</td>
                  <td className="px-3 py-2 text-end font-medium text-slate-800 dark:text-slate-100">
                    {formatMoney(it.total ?? it.quantity * it.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <Row label={t('billing.form.subtotal')} value={formatMoney(invoice.subtotal)} />
            <Row label={t('billing.form.discount')} value={`- ${discountLabel}`} />
            <Row label={t('billing.form.tax')} value={`+ ${taxLabel}`} />
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-white">{t('billing.form.total')}</span>
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">{formatMoney(invoice.total)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <Row label={t('billing.col.paid')} value={formatMoney(invoice.paidAmount)} />
            <Row label={t('billing.form.dueDate')} value={formatDateSafe(invoice.dueDate)} />
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-white">{t('billing.col.balance')}</span>
              <span className={`font-semibold ${balance > 0.001 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatMoney(balance)}
              </span>
            </div>
            {invoice.notes && (
              <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{invoice.notes}</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('billing.detail.payments')}</h4>
          {invoice.payments?.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {invoice.payments.map((p, i) => (
                <li key={i} className={`flex items-center justify-between px-3 py-2 text-sm ${p.isRefund ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                  <div>
                    <span className={`font-medium ${p.isRefund ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                      {p.isRefund ? '-' : ''}{formatMoney(Math.abs(p.amount))}
                    </span>
                    <span className={`ms-2 ${p.isRefund ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {t(paymentMethodTKey(p.method))}
                    </span>
                    {p.reference && <span className="ms-2 text-xs text-slate-400 dark:text-slate-500">· {p.reference}</span>}
                    {p.isRefund && <span className="ms-2 text-xs text-red-500 dark:text-red-400">{t('billing.detail.refund')}</span>}
                  </div>
                  <div className="text-end text-xs text-slate-400 dark:text-slate-500">
                    <div>{formatDate(p.date)}</div>
                    {p.recordedBy?.name && <div>{p.recordedBy.name}</div>}
                    {p.notes && <div className="italic">{p.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
              {t('billing.detail.noPayments')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
