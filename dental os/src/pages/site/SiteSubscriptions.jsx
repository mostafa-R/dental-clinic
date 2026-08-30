import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatDate, formatMoney } from '../../lib/format';

const STATUS_BADGES = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  past_due: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

export default function SiteSubscriptions() {
  const dispatch = useDispatch();
  const { t } = useT();
  const adminRole = useSelector((s) => s.siteAuth.admin?.role);
  const isSuperAdmin = adminRole === 'super_admin';

  const [data, setData] = useState({ subscriptions: [], stats: null });
  const [status, setStatus] = useState('idle');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentTenant, setPaymentTenant] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'card', reference: '', notes: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [subscriptions, stats] = await Promise.all([
        platformApi.listSubscriptions(),
        platformApi.getRevenueStats(),
      ]);
      setData({ subscriptions, stats });
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const [form, setForm] = useState({ status: 'active', billingCycle: 'monthly' });

  const onOpenModal = (sub) => {
    setForm({
      status: sub.status,
      billingCycle: sub.billingCycle,
    });
    setEditing(sub);
    setFormOpen(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await platformApi.updateSubscription(editing._id, {
        status: form.status,
        billingCycle: form.billingCycle,
      });
      setFormOpen(false);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (sub) => {
    setPaymentTenant(sub.tenant?._id || sub.tenant);
    setPaymentForm({
      amount: sub.amount || '',
      paymentMethod: 'card',
      reference: '',
      notes: '',
    });
  };

  const onPaymentChange = (e) => setPaymentForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onPaymentSubmit = async (e) => {
    e.preventDefault();
    setPaymentSaving(true);
    try {
      await platformApi.recordPayment(paymentTenant, {
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
      });
      setPaymentTenant(null);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setPaymentSaving(false);
    }
  };

  const onProcessPayment = (sub) => openPayment(sub);

  const stats = data.stats || {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.subscriptions.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.subscriptions.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('site.subscriptions.stats.mrr')} value={`$${formatMoney(stats.mrr)}`} />
        <StatCard label={t('site.subscriptions.stats.totalRevenue')} value={`$${formatMoney(stats.totalRevenue)}`} />
        <StatCard label={t('site.subscriptions.stats.pending')} value={stats.pendingPayments?.length ?? '—'} />
        <StatCard label={t('site.subscriptions.stats.plans')} value={stats.revenueByPlan?.length ?? '—'} />
      </div>

      {status === 'loading' && <Spinner label={t('site.subscriptions.loading')} />}
      {status === 'succeeded' && data.subscriptions.length === 0 && (
        <EmptyState title={t('site.subscriptions.empty')} description={t('site.subscriptions.emptyHint')} />
      )}

      {status === 'succeeded' && data.subscriptions.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('site.subscriptions.col.tenant')}</th>
                  <th className="px-4 py-3 text-left">{t('site.subscriptions.col.amount')}</th>
                  <th className="px-4 py-3 text-left">{t('site.subscriptions.col.cycle')}</th>
                  <th className="px-4 py-3 text-left">{t('site.subscriptions.col.status')}</th>
                  <th className="px-4 py-3 text-left">{t('site.subscriptions.col.currentPeriod')}</th>
                  <th className="px-4 py-3 text-right">{t('site.subscriptions.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.subscriptions.map((sub) => (
                  <tr key={sub._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{sub.tenant?.name || '—'}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{sub.plan} · {sub.tenant?.email}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">${formatMoney(sub.amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {sub.billingCycle === 'yearly' ? t('site.subscriptions.yearly') : t('site.subscriptions.monthly')}
                      {sub.cancelAtPeriodEnd && (
                        <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                          {t('site.subscriptions.cancelAtPeriodEnd')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[sub.status] || STATUS_BADGES.cancelled}`}>
                        {t(`site.subscriptions.status.${sub.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {formatDate(sub.currentPeriodStart)} → {formatDate(sub.currentPeriodEnd)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onProcessPayment(sub)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                        >
                          {t('site.subscriptions.processPayment')}
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => onOpenModal(sub)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {t('common.edit')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('site.subscriptions.editTitle', { tenant: editing?.tenant?.name || '' })}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.subscriptions.field.status')}</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {Object.keys(STATUS_BADGES).map((s) => (
                <option key={s} value={s}>{t(`site.subscriptions.status.${s}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.subscriptions.field.cycle')}</label>
            <select
              value={form.billingCycle}
              onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="monthly">{t('site.subscriptions.monthly')}</option>
              <option value="yearly">{t('site.subscriptions.yearly')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cancelAtPeriodEnd"
              checked={form.cancelAtPeriodEnd}
              onChange={(e) => setForm((f) => ({ ...f, cancelAtPeriodEnd: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
            />
            <label htmlFor="cancelAtPeriodEnd" className="text-sm text-slate-700 dark:text-slate-200">
              {t('site.subscriptions.field.cancelAtPeriodEnd')}
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(paymentTenant)}
        onClose={() => setPaymentTenant(null)}
        title={t('site.subscriptions.paymentTitle')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPaymentTenant(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onPaymentSubmit}
              disabled={paymentSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {paymentSaving ? t('common.saving') : t('site.subscriptions.paymentSubmit')}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.subscriptions.field.amount')}</label>
            <input
              name="amount"
              type="number"
              min={0}
              step="0.01"
              value={paymentForm.amount}
              onChange={onPaymentChange}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{t('site.subscriptions.amountMustMatch')}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.subscriptions.field.paymentMethod')}</label>
            <select name="paymentMethod" value={paymentForm.paymentMethod} onChange={onPaymentChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <option value="cash">{t('site.subscriptions.method.cash')}</option>
              <option value="card">{t('site.subscriptions.method.card')}</option>
              <option value="transfer">{t('site.subscriptions.method.transfer')}</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}