import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchBillingSummary,
  fetchInvoices,
  resetBilling,
  setPage,
  setSearch,
  setStatusFilter,
  voidInvoice,
} from '../features/billing/billingSlice';
import BillingSummary from '../features/billing/BillingSummary';
import AgingReport from '../features/billing/AgingReport';
import InvoiceFormModal from '../features/billing/InvoiceFormModal';
import InvoiceDetailModal from '../features/billing/InvoiceDetailModal';
import PaymentModal from '../features/billing/PaymentModal';
import InvoicesTable from '../features/billing/InvoicesTable';
import { INVOICE_STATUSES, statusTKey } from '../features/billing/statuses';
import { showErrorDialog } from '../features/ui/uiSlice';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Spinner from '../components/ui/Spinner';
import { canManageBilling, canViewBilling } from '../lib/roles';
import { useT } from '../lib/i18n';

export default function Billing() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, pagination, query, status, error, summary, summaryStatus } = useSelector((s) => s.billing);
  const canManage = canManageBilling();
  const canViewSummary = canViewBilling();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [voidingId, setVoidingId] = useState(null);
  const [agingOpen, setAgingOpen] = useState(false);

  useEffect(() => {
    if (!canViewBilling()) return undefined;
    dispatch(fetchInvoices(query));
  }, [dispatch, query]);

  useEffect(() => {
    if (canViewSummary && summaryStatus === 'idle') {
      dispatch(fetchBillingSummary());
    }
  }, [dispatch, canViewSummary, summaryStatus]);

  useEffect(() => () => dispatch(resetBilling()), [dispatch]);

  if (!canViewBilling()) {
    return (
      <Card>
        <EmptyState title={t('error.notAllowed')} message={t('error.notAllowedMsg')} />
      </Card>
    );
  }

  const refreshAll = () => {
    dispatch(fetchInvoices(query));
    if (canViewSummary) dispatch(fetchBillingSummary());
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (invoice) => {
    setEditing(invoice);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };
  const onSaved = () => {
    closeForm();
    refreshAll();
  };

  const openPay = (invoice) => {
    setViewing(null);
    setPaying(invoice);
  };
  const closePayment = () => setPaying(null);
  const onPaymentSaved = () => {
    closePayment();
    refreshAll();
  };

  const handleVoid = async (invoice) => {
    if (!window.confirm(t('billing.voidConfirm', { no: invoice.invoiceNo }))) return;
    setVoidingId(invoice._id);
    try {
      await dispatch(voidInvoice(invoice._id)).unwrap();
      setViewing(null);
      refreshAll();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setVoidingId(null);
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('billing.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('billing.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAgingOpen(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {t('billing.aging.title')}
        </button>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('billing.new')}
          </button>
        )}
      </header>

      {canViewSummary && (
        summaryStatus === 'loading' && !summary ? (
          <Card><Spinner label={t('billing.summary.loading')} /></Card>
        ) : (
          <BillingSummary summary={summary} />
        )
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <input
            type="text"
            value={query.search}
            onChange={(e) => dispatch(setSearch(e.target.value))}
            placeholder={t('billing.searchPlaceholder')}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <select
            value={query.status || ''}
            onChange={(e) => dispatch(setStatusFilter(e.target.value))}
            className={inputCls}
          >
            <option value="">{t('billing.allStatuses')}</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{t(statusTKey(s))}</option>
            ))}
          </select>
        </div>

        {isLoading && (
          <div className="px-5 py-16">
            <Spinner label={t('billing.loading')} />
          </div>
        )}

        {error && !isLoading && (
          <div className="px-5 py-16">
            <EmptyState title={t('billing.loadFailed')} message={error?.message || error} />
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => dispatch(fetchInvoices(query))}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {t('common.tryAgain')}
              </button>
            </div>
          </div>
        )}

        {status === 'succeeded' && !error && (
          <InvoicesTable onView={setViewing} onPay={openPay} onVoid={handleVoid} />
        )}

        {status === 'succeeded' && !error && items.length > 0 && (
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            pageSize={pagination.limit}
            onChange={(p) => dispatch(setPage(p))}
          />
        )}
      </Card>

      <InvoiceFormModal
        open={formOpen}
        invoice={editing}
        onClose={closeForm}
        onSaved={onSaved}
      />
      <PaymentModal
        open={Boolean(paying)}
        invoice={paying}
        onClose={closePayment}
        onSaved={onPaymentSaved}
      />
      <InvoiceDetailModal
        open={Boolean(viewing)}
        invoice={viewing}
        onClose={() => setViewing(null)}
        onPay={openPay}
        onEdit={openEdit}
        onVoid={handleVoid}
      />

      {voidingId && (
        <p className="sr-only">Voiding invoice…</p>
      )}

      <AgingReport open={agingOpen} onClose={() => setAgingOpen(false)} />
    </div>
  );
}
