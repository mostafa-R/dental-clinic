import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const fieldLabel = (t, key) => `site.settings.field.${key}`;

export default function SiteSettings() {
  const dispatch = useDispatch();
  const { t } = useT();
  const adminRole = useSelector((s) => s.siteAuth.admin?.role);
  const isAdmin = adminRole === 'super_admin' || adminRole === 'admin';

  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState('idle');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await platformApi.getPlatformSettings();
      setSettings(result.settings || result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const onChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSettings((s) => ({ ...s, [e.target.name]: val }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        autoSuspendDays: Number(settings.autoSuspendDays),
        emailNotifications: Boolean(settings.emailNotifications),
        maintenanceMode: Boolean(settings.maintenanceMode),
        allowedSiteIps: settings.allowedSiteIps || '',
        maxTenants: Number(settings.maxTenants),
        defaultPlan: settings.defaultPlan,
        trialDays: Number(settings.trialDays),
        backupEnabled: Boolean(settings.backupEnabled),
        backupRetentionDays: Number(settings.backupRetentionDays),
        backupTime: settings.backupTime,
      };
      await platformApi.updatePlatformSettings(payload);
      setMessage(t('site.settings.saved'));
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  const SectionTitle = ({ children }) => (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{children}</h2>
  );

  const Field = ({ name, label, type = 'text', children, ...rest }) => (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {children || (
        <input id={name} name={name} type={type} value={settings?.[name] ?? ''} onChange={onChange} className={inputCls} {...rest} />
      )}
    </div>
  );

  const BoolToggle = ({ name, label }) => (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type="checkbox"
        name={name}
        checked={Boolean(settings?.[name])}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
      />
    </div>
  );

  if (!isAdmin) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.settings.forbidden')}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.settings.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.settings.subtitle')}</p>
      </header>

      {status === 'loading' && <Spinner label={t('site.settings.loading')} />}
      {status === 'succeeded' && settings && (
        <form onSubmit={onSave} className="space-y-6">
          <Card>
            <div className="space-y-4">
              <SectionTitle>{t('site.settings.section.general')}</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field name="defaultPlan" label={t(fieldLabel(t, 'defaultPlan'))}>
                  <select name="defaultPlan" value={settings.defaultPlan} onChange={onChange} className={inputCls}>
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </Field>
                <Field name="trialDays" label={t(fieldLabel(t, 'trialDays'))} type="number" min={0} />
                <Field name="maxTenants" label={t(fieldLabel(t, 'maxTenants'))} type="number" min={1} />
                <Field name="autoSuspendDays" label={t(fieldLabel(t, 'autoSuspendDays'))} type="number" min={0} />
              </div>
              <BoolToggle name="emailNotifications" label={t('site.settings.field.emailNotifications')} />
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <SectionTitle>{t('site.settings.section.access')}</SectionTitle>
              <div>
                <label htmlFor="allowedSiteIps" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('site.settings.field.allowedSiteIps')}
                </label>
                <textarea
                  id="allowedSiteIps"
                  name="allowedSiteIps"
                  rows={3}
                  value={settings.allowedSiteIps || ''}
                  onChange={onChange}
                  className={inputCls}
                  placeholder={t('site.settings.field.allowedSiteIpsHint')}
                />
              </div>
              <BoolToggle name="maintenanceMode" label={t('site.settings.field.maintenanceMode')} />
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <SectionTitle>{t('site.settings.section.backup')}</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field name="backupRetentionDays" label={t(fieldLabel(t, 'backupRetentionDays'))} type="number" min={1} />
                <Field name="backupTime" label={t(fieldLabel(t, 'backupTime'))} type="time" step="60" />
              </div>
              <BoolToggle name="backupEnabled" label={t('site.settings.field.backupEnabled')} />
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {saving ? t('common.saving') : t('common.saveChanges')}
            </button>
            {message && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{message}</span>}
          </div>
        </form>
      )}
    </div>
  );
}