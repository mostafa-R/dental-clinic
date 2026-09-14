import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearSiteError, siteLogin, siteVerify2fa } from '../../features/site/siteAuthSlice';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import Button from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';

export default function SiteLogin() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error, challenge, admin } = useSelector((s) => s.siteAuth);
  const { t } = useT();

  const [form, setForm] = useState({ email: '', password: '' });
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const isLoading = status === 'loading';

  useEffect(() => {
    if (admin) navigate('/platform/dashboard', { replace: true });
  }, [admin, navigate]);

  useEffect(() => {
    if (error) {
      dispatch(showErrorDialog(error));
      dispatch(clearSiteError());
    }
  }, [error, dispatch]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await dispatch(siteLogin(form)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onSubmit2fa = async (e) => {
    e.preventDefault();
    try {
      await dispatch(
        siteVerify2fa({
          adminId: challenge.adminId,
          challengeToken: challenge.challengeToken,
          ...(useBackupCode ? { backupCode: code } : { token: code }),
        }),
      ).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  if (challenge) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.login.twoStepTitle')}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('site.login.twoStepSubtitle')}</p>
          </div>
          <form onSubmit={onSubmit2fa} className="space-y-4">
            <Field htmlFor="code" label={useBackupCode ? t('site.login.backupCode') : t('site.login.authCode')}>
              <TextInput
                id="code"
                name="code"
                type="text"
                required
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
              />
            </Field>
            <Button type="submit" disabled={isLoading} className="w-full py-2.5">
              {isLoading ? t('common.loading') : t('site.login.verify')}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setUseBackupCode((v) => !v)}
            className="mt-4 text-sm text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {useBackupCode ? t('site.login.useAuthCode') : t('site.login.useBackupCode')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.login.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('site.login.subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field htmlFor="email" label={t('login.email')}>
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={onChange}
              disabled={isLoading}
            />
          </Field>

          <Field htmlFor="password" label={t('login.password')}>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={onChange}
              disabled={isLoading}
            />
          </Field>

          <Button type="submit" disabled={isLoading} className="w-full py-2.5">
            {isLoading ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}