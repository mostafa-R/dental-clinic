import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export default function SitePlans() {
  const dispatch = useDispatch();
  const { t } = useT();
  const isSuperAdmin = useSelector((s) => s.siteAuth.admin?.role) === 'super_admin';

  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState('idle');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await platformApi.listPlans();
      setPlans(result.plans || []);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const defaultForm = () => ({
    name: '',
    price: 0,
    interval: 'month',
    support: 'Email',
    isActive: true,
    features: '',
    limits: { maxBranches: 1, maxDoctors: 3, maxPatients: 500, storage: '5GB' },
  });

  const [form, setForm] = useState(defaultForm());

  const onOpenModal = (plan) => {
    if (plan) {
      setForm({
        name: plan.name,
        price: plan.price,
        interval: plan.interval || 'month',
        support: plan.support || 'Email',
        isActive: plan.isActive !== false,
        features: (plan.features || []).join('\n'),
        limits: {
          maxBranches: plan.limits?.maxBranches ?? 1,
          maxDoctors: plan.limits?.maxDoctors ?? 3,
          maxPatients: plan.limits?.maxPatients ?? 500,
          storage: plan.limits?.storage || '5GB',
        },
      });
    } else {
      setForm(defaultForm());
    }
    setEditing(plan);
    setFormOpen(true);
  };

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const onLimitChange = (e) => setForm((f) => ({ ...f, limits: { ...f.limits, [e.target.name]: e.target.value } }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        interval: form.interval,
        support: form.support,
        isActive: form.isActive,
        features: form.features.split('\n').map((s) => s.trim()).filter(Boolean),
        limits: {
          maxBranches: Number(form.limits.maxBranches),
          maxDoctors: Number(form.limits.maxDoctors),
          maxPatients: Number(form.limits.maxPatients),
          storage: form.limits.storage,
        },
      };
      if (editing) {
        await platformApi.updatePlan(editing._id, payload);
      } else {
        await platformApi.createPlan(payload);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (plan) => {
    if (!window.confirm(t('site.plans.deleteConfirm', { name: plan.name }))) return;
    try {
      await platformApi.deletePlan(plan._id);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onToggleActive = async (plan) => {
    try {
      await platformApi.updatePlan(plan._id, { isActive: !plan.isActive });
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.plans.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.plans.subtitle')}</p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => onOpenModal(null)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('site.plans.create')}
          </button>
        )}
      </header>

      {status === 'loading' && <Spinner label={t('site.plans.loading')} />}
      {status === 'succeeded' && plans.length === 0 && (
        <EmptyState title={t('site.plans.empty')} description={t('site.plans.emptyHint')} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan._id}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{plan.key}</p>
              </div>
              {!plan.isActive && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {t('site.plans.inactive')}
                </span>
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">
              ${formatMoney(plan.price)}
              <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                / {plan.interval === 'year' ? t('site.plans.perYear') : t('site.plans.perMonth')}
              </span>
            </p>
            <div className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
              <p>{t('site.plans.maxBranches', { n: plan.limits?.maxBranches ?? '—' })}</p>
              <p>{t('site.plans.maxDoctors', { n: plan.limits?.maxDoctors ?? '—' })}</p>
              <p>{t('site.plans.maxPatients', { n: plan.limits?.maxPatients ?? '—' })}</p>
              <p>{t('site.plans.storage', { n: plan.limits?.storage ?? '—' })}</p>
              <p>{t('site.plans.modules', { n: plan.modules?.length ?? 0 })}</p>
            </div>
            {isSuperAdmin && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => onOpenModal(plan)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleActive(plan)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {plan.isActive ? t('site.plans.deactivate') : t('site.plans.activate')}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(plan)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('site.plans.editTitle') : t('site.plans.createTitle')}
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
        <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.name')}</label>
            <input name="name" value={form.name} onChange={onChange} required minLength={2} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.price')}</label>
            <input name="price" type="number" min={0} step="0.01" value={form.price} onChange={onChange} required className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.interval')}</label>
            <select name="interval" value={form.interval} onChange={onChange} className={inputCls}>
              <option value="month">{t('site.plans.perMonth')}</option>
              <option value="year">{t('site.plans.perYear')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.support')}</label>
            <input name="support" value={form.support} onChange={onChange} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.storage')}</label>
            <input name="storage" value={form.limits.storage} onChange={onLimitChange} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.maxBranches')}</label>
            <input name="maxBranches" type="number" min={0} value={form.limits.maxBranches} onChange={onLimitChange} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.maxDoctors')}</label>
            <input name="maxDoctors" type="number" min={0} value={form.limits.maxDoctors} onChange={onLimitChange} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.maxPatients')}</label>
            <input name="maxPatients" type="number" min={0} value={form.limits.maxPatients} onChange={onLimitChange} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.plans.field.features')}</label>
            <textarea name="features" rows={4} value={form.features} onChange={onChange} className={inputCls} placeholder={t('site.plans.field.featuresHint')} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700 dark:text-slate-200">{t('site.plans.field.isActive')}</label>
          </div>
        </form>
      </Modal>
    </div>
  );
}