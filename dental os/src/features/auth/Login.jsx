import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginUser, verifyImpersonation } from './authSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { defaultRouteFor } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import PreferencesControls from '../preferences/PreferencesControls';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, user } = useSelector((s) => s.auth);
  const { t } = useT();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const isLoading = status === 'loading';

  // Handle impersonation token from URL — verify server-side
  useEffect(() => {
    const token = searchParams.get('impersonation');
    if (!token) return;
    dispatch(verifyImpersonation(token));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate(defaultRouteFor(user.role), { replace: true });
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      const loggedInUser = await dispatch(loginUser(form)).unwrap();
      navigate(defaultRouteFor(loggedInUser.role), { replace: true });
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  // If impersonating, show brief loading then redirect
  if (searchParams.get('impersonation') && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-sm text-slate-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
      <div className="absolute top-4 end-4">
        <PreferencesControls />
      </div>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('login.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('login.subtitle')}</p>
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