import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export default function SiteTenantModal({ open, onClose, tenant, onSave }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const adminRole = useSelector((s) => s.siteAuth.admin?.role);
  const isEdit = Boolean(tenant);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: tenant?.name || '',
    email: tenant?.email || '',
    phone: tenant?.phone || '',
    plan: tenant?.plan || 'starter',
    status: tenant?.status || 'trial',
    address: tenant?.address || '',
    city: tenant?.city || '',
    country: tenant?.country || '',
    adminPassword: '',
  });

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && adminRole !== 'super_admin' && adminRole !== 'admin') {
      dispatch(showErrorDialog({ message: 'Forbidden' }));
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { name, email, phone, plan, status, address, city, country } = form;
        await onSave({ _id: tenant._id, name, email, phone, plan, status, address, city, country });
      } else {
        const { name, email, phone, plan, status, address, city, country, adminPassword } = form;
        await onSave({
          tenantData: {
            name,
            email,
            phone: phone || undefined,
            plan,
            status,
            address: address || undefined,
            city: city || undefined,
            country: country || undefined,
            adminPassword: adminPassword || undefined,
          },
        });
      }
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('site.tenants.editTitle') : t('site.tenants.createTitle')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
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
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.name')}</label>
          <input name="name" value={form.name} onChange={onChange} required minLength={2} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.email')}</label>
          <input name="email" type="email" value={form.email} onChange={onChange} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.phone')}</label>
          <input name="phone" value={form.phone} onChange={onChange} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.plan')}</label>
          <select name="plan" value={form.plan} onChange={onChange} className={inputCls}>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.status')}</label>
          <select name="status" value={form.status} onChange={onChange} className={inputCls}>
            <option value="trial">{t('tenant.status.trial')}</option>
            <option value="active">{t('tenant.status.active')}</option>
          </select>
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.adminPassword')}</label>
            <input name="adminPassword" type="password" minLength={8} value={form.adminPassword} onChange={onChange} placeholder={t('site.tenants.field.adminPasswordHint')} className={inputCls} />
          </div>
        )}
        <div className={isEdit ? '' : 'sm:col-span-2'}>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.address')}</label>
          <input name="address" value={form.address} onChange={onChange} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.city')}</label>
          <input name="city" value={form.city} onChange={onChange} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.tenants.field.country')}</label>
          <input name="country" value={form.country} onChange={onChange} className={inputCls} />
        </div>
      </form>
    </Modal>
  );
}