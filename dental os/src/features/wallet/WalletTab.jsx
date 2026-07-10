import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { fetchWallet, fetchInstallmentPlans, addTransaction, createInstallmentPlan, payInstallmentPlan, resetFormState } from './walletSlice';
import { canManageBilling, canViewBilling } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import { formatMoney, formatDate } from '../../lib/format';

const INSTALLMENT_STATUS_STYLES = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const PLAN_STATUS_STYLES = {
  active: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  defaulted: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export default function WalletTab({ patientId }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { wallet, walletStatus, plans, formStatus, formError } = useSelector((s) => s.wallet);
  const canManage = canManageBilling();
  const canView = canViewBilling();

  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundDesc, setFundDesc] = useState('');
  const [planTitle, setPlanTitle] = useState('');
  const [planTotal, setPlanTotal] = useState('');
  const [planFrequency, setPlanFrequency] = useState('monthly');
  const [planInstallments, setPlanInstallments] = useState([{ dueDate: '', amount: '' }]);
  const [payingPlanId, setPayingPlanId] = useState(null);
  const [payAmount, setPayAmount] = useState('');

  useEffect(() => {
    if (!canView) return;
    dispatch(fetchWallet(patientId));
    dispatch(fetchInstallmentPlans({ patientId, params: { limit: 100 } }));
  }, [dispatch, patientId, canView]);

  const handleAddFunds = useCallback(async (e) => {
    e.preventDefault();
    if (!fundAmount || Number(fundAmount) <= 0) return;
    await dispatch(addTransaction({
      patientId,
      payload: { type: 'credit', amount: Number(fundAmount), description: fundDesc },
    }));
    setShowAddFunds(false);
    setFundAmount('');
    setFundDesc('');
    dispatch(resetFormState());
  }, [dispatch, patientId, fundAmount, fundDesc]);

  const handleAddInstallment = () => {
    setPlanInstallments((prev) => [...prev, { dueDate: '', amount: '' }]);
  };

  const handleRemoveInstallment = (idx) => {
    setPlanInstallments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleInstallmentChange = (idx, field, value) => {
    setPlanInstallments((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleCreatePlan = useCallback(async (e) => {
    e.preventDefault();
    if (!planTitle || !planTotal || Number(planTotal) <= 0) return;
    const validated = planInstallments.filter((i) => i.dueDate && i.amount);
    if (validated.length === 0) return;

    await dispatch(createInstallmentPlan({
      patientId,
      payload: {
        title: planTitle,
        totalAmount: Number(planTotal),
        frequency: planFrequency,
        installments: validated.map((i) => ({
          dueDate: new Date(i.dueDate).toISOString(),
          amount: Number(i.amount),
        })),
      },
    }));
    setShowNewPlan(false);
    setPlanTitle('');
    setPlanTotal('');
    setPlanFrequency('monthly');
    setPlanInstallments([{ dueDate: '', amount: '' }]);
    dispatch(resetFormState());
  }, [dispatch, patientId, planTitle, planTotal, planFrequency, planInstallments]);

  const handlePayInstallment = useCallback(async (planId) => {
    if (!payAmount || Number(payAmount) <= 0) return;
    await dispatch(payInstallmentPlan({
      patientId,
      planId,
      payload: { amount: Number(payAmount) },
    }));
    setPayingPlanId(null);
    setPayAmount('');
    dispatch(resetFormState());
  }, [dispatch, patientId, payAmount]);

  if (!canView) {
    return <EmptyState title={t('error.notAllowed')} message={t('error.notAllowedMsg')} />;
  }

  const isLoading = walletStatus === 'loading' || walletStatus === 'idle';

  return (
    <div className="space-y-6">
      {/* Wallet Balance */}
      <Card title={t('wallet.balance')}>
        {isLoading && <Spinner />}
        {!isLoading && wallet && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatMoney(wallet.balance)}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{wallet.transactions?.length || 0} {t('wallet.transactions')}</p>
            </div>
            {canManage && (
              <button type="button" onClick={() => setShowAddFunds(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                {t('wallet.addFunds')}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Add Funds Form */}
      {showAddFunds && (
        <Card title={t('wallet.addFunds')}>
          <form onSubmit={handleAddFunds} className="space-y-3">
            <input type="number" step="0.01" min="0.01" required
              value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
              placeholder={t('wallet.amount')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
            <input type="text" value={fundDesc} onChange={(e) => setFundDesc(e.target.value)}
              placeholder={t('wallet.description')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={formStatus === 'loading'}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {formStatus === 'loading' ? t('common.saving') : t('wallet.addFunds')}
              </button>
              <button type="button" onClick={() => setShowAddFunds(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Transactions */}
      <Card title={t('wallet.transactions')}>
        {isLoading && <Spinner />}
        {!isLoading && wallet && wallet.transactions?.length === 0 && (
          <EmptyState title={t('wallet.noTransactions')} />
        )}
        {!isLoading && wallet && wallet.transactions?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-400 dark:border-slate-700">
                  <th className="pb-2 font-medium">{t('wallet.date')}</th>
                  <th className="pb-2 font-medium">{t('wallet.type')}</th>
                  <th className="pb-2 font-medium">{t('wallet.amount')}</th>
                  <th className="pb-2 font-medium">{t('wallet.description')}</th>
                  <th className="pb-2 font-medium">{t('wallet.balanceLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {[...wallet.transactions].reverse().slice(0, 50).map((tx, i) => (
                  <tr key={tx._id || i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-500 dark:text-slate-400">{formatDate(tx.createdAt)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tx.type === 'credit' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                        {tx.type === 'credit' ? t('wallet.credit') : t('wallet.debit')}
                      </span>
                    </td>
                    <td className="py-2 font-medium text-slate-900 dark:text-white">{formatMoney(tx.amount)}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{tx.description || '—'}</td>
                    <td className="py-2 text-slate-900 dark:text-white">{formatMoney(tx.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Installment Plans */}
      <Card title={t('wallet.installmentPlans')}
        action={canManage && (
          <button type="button" onClick={() => setShowNewPlan(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
            {t('wallet.newPlan')}
          </button>
        )}
      >
        {plans.status === 'loading' && <Spinner />}
        {plans.status === 'succeeded' && plans.items.length === 0 && (
          <EmptyState title={t('wallet.noPlans')} />
        )}
        {plans.items.length > 0 && (
          <div className="space-y-4">
            {plans.items.map((plan) => (
              <div key={plan._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{plan.title}</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{plan.installments?.length || 0} {t('wallet.installments')} · {t(`wallet.frequency.${plan.frequency || 'monthly'}`)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_STYLES[plan.status]}`}>
                    {t(`wallet.planStatus.${plan.status}`)}
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white p-2 dark:bg-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('wallet.totalAmount')}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatMoney(plan.totalAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-2 dark:bg-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('wallet.paidAmount')}</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(plan.paidAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-2 dark:bg-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('wallet.balanceLabel')}</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatMoney(plan.totalAmount - plan.paidAmount)}</p>
                  </div>
                </div>

                {/* Installments list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 dark:border-slate-700">
                        <th className="pb-1 font-medium">#</th>
                        <th className="pb-1 font-medium">{t('wallet.dueDate')}</th>
                        <th className="pb-1 font-medium">{t('wallet.amount')}</th>
                        <th className="pb-1 font-medium">{t('wallet.paidAmount')}</th>
                        <th className="pb-1 font-medium">{t('wallet.status')}</th>
                        <th className="pb-1 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.installments.map((inst) => (
                        <tr key={inst._id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 text-slate-500">{inst.number}</td>
                          <td className="py-1.5 text-slate-700 dark:text-slate-300">{formatDate(inst.dueDate)}</td>
                          <td className="py-1.5 font-medium text-slate-900 dark:text-white">{formatMoney(inst.amount)}</td>
                          <td className="py-1.5 text-slate-900 dark:text-white">{formatMoney(inst.paidAmount)}</td>
                          <td className="py-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${INSTALLMENT_STATUS_STYLES[inst.status]}`}>
                              {t(`wallet.installment${inst.status.charAt(0).toUpperCase() + inst.status.slice(1)}`)}
                            </span>
                          </td>
                          <td className="py-1.5">
                            {inst.status === 'pending' && canManage && (
                              <button type="button" onClick={() => { setPayingPlanId(plan._id); setPayAmount(inst.amount - inst.paidAmount); }}
                                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                                {t('wallet.pay')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pay Installment Modal */}
      {payingPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">{t('wallet.pay')}</h3>
            <input type="number" step="0.01" min="0.01" required value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={t('wallet.amount')}
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
            <div className="flex gap-2">
              <button type="button" onClick={() => handlePayInstallment(payingPlanId)} disabled={formStatus === 'loading'}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {formStatus === 'loading' ? t('common.saving') : t('wallet.pay')}
              </button>
              <button type="button" onClick={() => { setPayingPlanId(null); setPayAmount(''); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Installment Plan Form */}
      {showNewPlan && (
        <Card title={t('wallet.createPlan')}>
          <form onSubmit={handleCreatePlan} className="space-y-3">
            <input type="text" required value={planTitle} onChange={(e) => setPlanTitle(e.target.value)}
              placeholder={t('wallet.planTitle')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
            <div className="flex gap-3">
              <input type="number" step="0.01" min="0.01" required value={planTotal}
                onChange={(e) => setPlanTotal(e.target.value)}
                placeholder={t('wallet.totalAmount')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
              <select value={planFrequency} onChange={(e) => setPlanFrequency(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="weekly">{t('wallet.frequency.weekly')}</option>
                <option value="biweekly">{t('wallet.frequency.biweekly')}</option>
                <option value="monthly">{t('wallet.frequency.monthly')}</option>
                <option value="custom">{t('wallet.frequency.custom')}</option>
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('wallet.installments')}</p>
              {planInstallments.map((inst, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="date" required value={inst.dueDate}
                    onChange={(e) => handleInstallmentChange(idx, 'dueDate', e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input type="number" step="0.01" min="0.01" required value={inst.amount}
                    onChange={(e) => handleInstallmentChange(idx, 'amount', e.target.value)}
                    placeholder={t('wallet.amount')}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500" />
                  {planInstallments.length > 1 && (
                    <button type="button" onClick={() => handleRemoveInstallment(idx)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={handleAddInstallment}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                + {t('billing.form.addItem')}
              </button>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={formStatus === 'loading'}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {formStatus === 'loading' ? t('common.saving') : t('wallet.createPlan')}
              </button>
              <button type="button" onClick={() => setShowNewPlan(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
