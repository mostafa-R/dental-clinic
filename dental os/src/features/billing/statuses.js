export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'void'];

/** i18n key for a given invoice status. */
export function statusTKey(status) {
  return `invoice.status.${status}`;
}

const STATUS_STYLES = {
  unpaid: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  void: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600',
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600';
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'wallet'];

/** i18n key for a given payment method. */
export function paymentMethodTKey(method) {
  return `invoice.payment.${method}`;
}
