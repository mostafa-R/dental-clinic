import { Link, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useLandingPath } from '../lib/roles';

/**
 * Shown when a page is denied *and* the landing route itself is denied — the
 * user has no module they can open at all. The guard only renders this instead
 * of redirecting, because redirecting here is what used to loop forever.
 *
 * `reason` distinguishes an upgrade prompt (module outside the tenant's plan)
 * from a role problem (module in the plan, role grants nothing), so the copy
 * tells the user who can actually fix it.
 */
export default function AccessDenied({ reason = 'permission', module }) {
  const { t } = useT();
  const location = useLocation();
  const landingPath = useLandingPath();

  const isPlanIssue = reason === 'plan';
  // The guard only reaches this screen when the landing route is the page being
  // denied, so "go home" would point at the page the user is already on. Show it
  // only when it genuinely leads somewhere.
  const canGoHome = landingPath !== location.pathname;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
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
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('accessDenied.title')}
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          {isPlanIssue ? t('accessDenied.planBody') : t('accessDenied.permissionBody')}
        </p>

        {module && (
          <p
            className="mx-auto mt-4 inline-block rounded-lg border border-dashed border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
            dir="ltr"
          >
            {t(`mod.${module}`)}
          </p>
        )}

        {canGoHome && (
          <Link
            to={landingPath}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98] sm:w-auto"
          >
            {t('accessDenied.goHome')}
          </Link>
        )}
      </div>
    </div>
  );
}
