import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginUser, verifyImpersonation } from './authSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { defaultRouteFor } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import PreferencesControls from '../preferences/PreferencesControls';
import DentoCareLogo from '../../components/ui/DentoCareLogo';
import Button from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';

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
      const { resetPermissions } = await import('../users/userSlice');
      dispatch(resetPermissions());
      const loggedInUser = await dispatch(loginUser(form)).unwrap();
      navigate(defaultRouteFor(loggedInUser.role), { replace: true });
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  // If impersonating, show brief loading then redirect
  if (searchParams.get('impersonation') && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-sm text-slate-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 dark:bg-slate-950">
      <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -end-24 h-80 w-80 rounded-full bg-smile/15 blur-3xl dark:bg-smile/5" />
      <div className="absolute top-4 end-4">
        <PreferencesControls />
      </div>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 text-center">
          <DentoCareLogo variant="brand" width={210} height={58} className="mx-auto" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('login.subtitle')}</p>
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