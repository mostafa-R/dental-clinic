import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearSiteError, siteLogin, siteVerify2fa } from '../../features/site/siteAuthSlice';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';

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

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  if (challenge) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.login.twoStepTitle')}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('site.login.twoStepSubtitle')}</p>
          </div>
          <form onSubmit={onSubmit2fa} className="space-y-4">
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {useBackupCode ? t('site.login.backupCode') : t('site.login.authCode')}
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isLoading ? t('common.loading') : t('site.login.verify')}
            </button>
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
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.login.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('site.login.subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('login.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={onChange}
              disabled={isLoading}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('login.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={onChange}
              disabled={isLoading}
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isLoading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}