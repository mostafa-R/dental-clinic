import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import { PageLoader } from "../components/ui/Spinner";
import StatCard from "../components/ui/StatCard";
import {
  BanknoteIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "../components/ui/icons";
import {
  fetchRevenueStats,
  fetchSubscriptions,
  updateSubscription,
  processPayment,
} from "../features/subscriptions/subscriptionsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import { formatCurrency, formatDate } from "../lib/format";
import { t } from "../lib/i18n";

export default function Billing() {
  const dispatch = useDispatch();
  const { items, revenueStats, loading } = useSelector((state) => state.subscriptions);
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const [paymentModal, setPaymentModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [editPlan, setEditPlan] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchRevenueStats());
    dispatch(fetchSubscriptions());
    dispatch(fetchPlans());
  }, [dispatch]);

  if (loading && !revenueStats.totalRevenue) {
    return (
      <AppLayout>
        <Topbar title={t("billing", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("billing", language)} />
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title={t("totalRevenueLabel", language)}
            value={formatCurrency(revenueStats.totalRevenue || 0, "USD", language)}
            icon={BanknoteIcon}
          />
          <StatCard
            title={t("monthlyRecurringLabel", language)}
            value={formatCurrency(revenueStats.monthlyRecurring || 0, "USD", language)}
            icon={CreditCardIcon}
            trend="up"
            change={t("fromLastMonth", language)}
          />
          <StatCard
            title={t("yearlyRecurring", language)}
            value={formatCurrency(revenueStats.yearlyRecurring || 0, "USD", language)}
            icon={BanknoteIcon}
          />
          <StatCard
            title={t("pendingPaymentsCount", language)}
            value={revenueStats.pendingPayments?.length || 0}
            icon={ExclamationTriangleIcon}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t("pendingPaymentsCount", language)}
            </h3>
            {revenueStats.pendingPayments?.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                {t("noPendingPayments", language)}
              </p>
            ) : (
              <div className="space-y-3">
                {revenueStats.pendingPayments?.map((payment) => (
                  <div
                    key={payment._id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {payment.tenantName}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t("due", language)}: {formatDate(payment.dueDate, language)}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {formatCurrency(payment.amount, "USD", language)}
                      </p>
                      <Badge variant="warning">{t("overdue", language)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t("revenueByPlan", language)}
            </h3>
            <div className="space-y-4">
              {revenueStats.revenueByPlan?.map((item) => (
                <div
                  key={item.plan}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-500" />
                    <span className="text-slate-600 dark:text-slate-300 capitalize">
                      {item.plan}
                    </span>
                  </div>
                  <div className="text-end">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatCurrency(item.revenue, "USD", language)}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 ms-2">
                      {t("tenants_count", { count: item.count }, language)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Subscription table */}
        <Card className="mt-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white p-4 border-b border-slate-200 dark:border-slate-700">
            {t("activeSubscriptions", language)}
          </h3>
          {items.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t("noData", language)}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("tenantName", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("plan", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("subscriptionStatus", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("amount", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("subscriptionEndDate", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("actions", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((sub) => (
                    <tr key={sub._id} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{sub.tenant?.name || "—"}</td>
                      <td className="px-4 py-3 capitalize">{sub.plan}</td>
                      <td className="px-4 py-3">
                        <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'past_due' ? 'danger' : 'warning'} size="sm">
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{formatCurrency(sub.amount, 'USD', language)}</td>
                      <td className="px-4 py-3 text-slate-500">{sub.nextPaymentAt ? formatDate(sub.nextPaymentAt, language) : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditModal(sub); setEditPlan(sub.plan); }}
                            className="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                          >
                            {t("edit", language)}
                          </button>
                          {sub.status === 'past_due' && (
                            <button
                              onClick={() => { setPaymentModal(sub); setPaymentAmount(String(sub.amount || "")); }}
                              className="text-xs text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                            >
                              {t("processPayment", language)}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          isOpen={!!editModal}
          onClose={() => {
            setEditModal(null);
            setEditPlan("");
          }}
          title={t("edit", language)}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("plan", language)}
              </label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                {plans.map((plan) => (
                  <option key={plan._id} value={plan.key}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditModal(null)}>
                {t("cancel", language)}
              </Button>
              <Button
                loading={actionLoading}
                onClick={async () => {
                  if (!editModal) return;
                  setActionLoading(true);
                  try {
                    await dispatch(updateSubscription({
                      id: editModal._id,
                      data: {
                        plan: editPlan,
                        status: editModal.status,
                        amount: editModal.amount,
                        currentPeriodEnd: editModal.currentPeriodEnd,
                      },
                    }));
                    setEditModal(null);
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {t("save", language)}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={!!paymentModal}
          onClose={() => {
            setPaymentModal(null);
            setPaymentAmount("");
            setPaymentMethod("cash");
          }}
          title={t("processPayment", language)}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("amount", language)}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("paymentMethod", language)}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPaymentModal(null)}>
                {t("cancel", language)}
              </Button>
              <Button
                loading={actionLoading}
                onClick={async () => {
                  if (!paymentModal) return;
                  setActionLoading(true);
                  try {
                    await dispatch(processPayment({
                      tenantId: paymentModal.tenant?._id || paymentModal.tenant,
                      data: {
                        amount: Number(paymentAmount || paymentModal.amount || 0),
                        method: paymentMethod,
                      },
                    }));
                    setPaymentModal(null);
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {t("processPayment", language)}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
