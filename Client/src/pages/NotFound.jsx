import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useT } from '../lib/i18n';
import { useLandingPath } from '../lib/roles';
import { DentoCareLogo } from '../components/ui/DentoCareLogo';

export default function NotFound({ embedded = false }) {
  const { t } = useT();
  const location = useLocation();
  const navigate = useNavigate();
  // Points at a page the signed-in user is allowed to open, so "Go home" can
  // never drop them straight back onto a 404.
  const homeTo = useLandingPath();
  const user = useSelector((s) => s.auth.user);
  const loginTo = '/login';
  // Checked separately: `useLandingPath()` returns a truthy fallback path even
  // for a signed-out visitor, so it cannot stand in for an auth check here.
  const isAuthenticated = Boolean(user);

  const body = (
    <div className="w-full max-w-lg text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-light/25 text-brand ring-1 ring-brand/10 dark:bg-brand/15 dark:text-brand-light dark:ring-brand/20">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
          <path d="M8.5 11h5" />
        </svg>
      </div>

      <p className="mt-6 font-mono text-sm font-semibold tracking-widest text-brand uppercase dark:text-brand-light">
        {t('notFound.badge')}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
        {t('notFound.title')}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
        {t('notFound.message')}
      </p>

      {location.pathname && location.pathname !== '/' && (
        <p
          className="mx-auto mt-4 max-w-md truncate rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
          dir="ltr"
          title={location.pathname}
        >
          {location.pathname}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-brand/5 hover:border-brand/30 hover:text-brand-dark active:scale-[0.98] sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span aria-hidden="true">←</span>
          {t('notFound.goBack')}
        </button>
        <Link
          to={isAuthenticated ? homeTo : loginTo}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98] sm:w-auto dark:bg-brand dark:hover:bg-brand-dark"
        >
          {isAuthenticated ? t('notFound.goHome') : t('notFound.goLogin')}
        </Link>
      </div>
    </div>
  );

  if (embedded) {
    return <div className="flex items-center justify-center px-6 py-16">{body}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas dark:bg-slate-950">
      <header className="flex h-16 shrink-0 items-center border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/80">
        <Link to="/" aria-label="DentoCare home">
          <DentoCareLogo width={150} height={40} />
        </Link>
        <span className="ms-auto rounded-full border border-slate-200 bg-white px-3 py-1 font-mono text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          404
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">{body}</main>
    </div>
  );
}
