import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
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
import RefundModal from '../features/billing/RefundModal';
import VoidConfirmModal from '../features/billing/VoidConfirmModal';
import InvoicesTable from '../features/billing/InvoicesTable';
import { INVOICE_STATUSES, statusTKey } from '../features/billing/statuses';
import { showErrorDialog } from '../features/ui/uiSlice';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Spinner from '../components/ui/Spinner';
import { useSocketEvent } from '../lib/socket';
import { useCanViewBilling, useCanCreateInvoices } from '../lib/roles';
import { useT } from '../lib/i18n';



export default function Billing() {
  const dispatch = useDispatch();
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const { items, pagination, query, status, error, summary, summaryStatus } = useSelector((s) => s.billing);
  const canViewSummary = useCanViewBilling();
  const canCreate = useCanCreateInvoices();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [agingOpen, setAgingOpen] = useState(false);

  // Search is held locally and pushed into the store on a debounce. Dispatching
  // setSearch on every keystroke made `query` change on every character, and the
  // effect below refetches on each `query` change — so typing a 6-character
  // term fired 6 full list requests.
  const [searchInput, setSearchInput] = useState(() => query.search || '');
  useEffect(() => {
    if (searchInput === (query.search || '')) return undefined;
    const id = setTimeout(() => dispatch(setSearch(searchInput)), 300);
    return () => clearTimeout(id);
  }, [dispatch, query.search, searchInput]);
  // Pull external changes to the stored query back into the input, so the
  // debounce cannot leave the box showing a term the list is not filtered by.
  useEffect(() => {
    setSearchInput((prev) => (prev === (query.search || '') ? prev : query.search || ''));
  }, [query.search]);
  const [voidLoading, setVoidLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      // A `?new=1` deep link must not bypass the create permission: drop the
      // param and stay on the list when the role has no `billing:create`.
      setSearchParams({}, { replace: true });
      if (!canCreate) return;
      setEditing(null);
      setFormOpen(true);
    }
  }, [searchParams, setSearchParams, canCreate]);

  useEffect(() => {
    if (!canViewSummary) return undefined;
    dispatch(fetchInvoices(query));
  }, [dispatch, query, canViewSummary]);

  useEffect(() => {
    if (canViewSummary && summaryStatus === 'idle') {
      dispatch(fetchBillingSummary());
    }
  }, [dispatch, canViewSummary, summaryStatus]);

  const refreshAll = useCallback(() => {
    dispatch(fetchInvoices(query));
    if (canViewSummary) dispatch(fetchBillingSummary());
  }, [dispatch, query, canViewSummary]);

  useSocketEvent('invoice:created', refreshAll);
  useSocketEvent('invoice:updated', refreshAll);

  useEffect(() => () => dispatch(resetBilling()), [dispatch]);

  if (!canViewSummary) {
    return (
      <Card>
        <EmptyState title={t('error.notAllowed')} message={t('error.notAllowedMsg')} />
      </Card>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (invoice) => {
    setViewing(null);
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

  const handleVoid = async (reason) => {
    if (!voiding || !reason.trim()) return;
    setVoidLoading(true);
    try {
      await dispatch(voidInvoice({ id: voiding._id, reason: reason.trim() })).unwrap();
      setViewing(null);
      setVoiding(null);
      refreshAll();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setVoidLoading(false);
    }
  };

  const handleRefund = () => {
    setViewing(null);
    setRefunding(null);
    refreshAll();
  };

  const isLoading = status === 'loading' || status === 'idle';

  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-brand-light';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('billing.title')}
        subtitle={t('billing.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAgingOpen(true)}>
              {t('billing.aging.title')}
            </Button>
            {canCreate && (
              <Button size="sm" onClick={openCreate}>
                {t('billing.new')}
              </Button>
            )}
          </div>
        }
      />

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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('billing.searchPlaceholder')}
            aria-label={t('billing.searchPlaceholder')}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <select
            value={query.status || ''}
            onChange={(e) => dispatch(setStatusFilter(e.target.value))}
            aria-label={t('billing.allStatuses')}
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
              <Button size="sm" onClick={() => dispatch(fetchInvoices(query))}>
                {t('common.tryAgain')}
              </Button>
            </div>
          </div>
        )}

        {status === 'succeeded' && !error && (
          <InvoicesTable onView={setViewing} onPay={openPay} onVoid={setVoiding} />
        )}

        {status === 'succeeded' && !error && items.length > 0 && (
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            pageSize={pagination.limit}
            onChange={(p) => dispatch(setPage(p))}
            prevLabel={t('common.prev')}
            nextLabel={t('common.next')}
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
        onVoid={(inv) => { setViewing(null); setVoiding(inv); }}
        onRefund={(inv) => { setViewing(null); setRefunding(inv); }}
      />

      <VoidConfirmModal
        open={Boolean(voiding)}
        invoice={voiding}
        onClose={() => setVoiding(null)}
        onConfirm={handleVoid}
        loading={voidLoading}
      />

      <RefundModal
        open={Boolean(refunding)}
        invoice={refunding}
        onClose={() => setRefunding(null)}
        onSaved={handleRefund}
      />

      {voiding && (
        <p className="sr-only">{t('billing.voiding')}</p>
      )}

      <AgingReport open={agingOpen} onClose={() => setAgingOpen(false)} />
    </div>
  );
}
