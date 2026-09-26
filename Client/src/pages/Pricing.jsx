import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials } from '../features/auth/authSlice';
import { authApi } from '../features/auth/authApi';
import { listPublicPlans } from '../features/pricing/plansApi';
import { landingPathFor } from '../lib/roles';
import { useT } from '../lib/i18n';
import { formatMoney, formatNumber } from '../lib/format';
import { DentoCareLogo } from '../components/ui/DentoCareLogo';
import PreferencesControls from '../features/preferences/PreferencesControls';
import EmptyState from '../components/ui/EmptyState';

const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');

function WhatsAppIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M9 9.5c.5 2.5 3 5 5.5 5.5l1-1.5 2 1c-.5 1.5-1.5 2-3 1.5-3-1-6-4-7-7-.5-1.5 0-2.5 1.5-3l1 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-brand dark:text-brand-light"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlanCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-8 w-32 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-5 space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="mt-6 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

export default function Pricing() {
  const { t } = useT();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  // The landing route is permission-aware, so a signed-in visitor without the
  // module their role prefers is not bounced into a 403 loop.
  const myPermissions = useSelector((s) => s.users?.myPermissions);
  const [probedUser, setProbedUser] = useState(null);

  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState('idle');

  // Silently detect an existing session so signed-in users skip the landing
  // page. Uses the _silent API variant which never triggers the hard
  // redirect to /login on 401.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      authApi
        .getMeSilent()
        .then(({ user: me }) => {
          if (cancelled || !me) return;
          dispatch(setCredentials(me));
          setProbedUser(me);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [dispatch, user]);

  const loadPlans = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await listPublicPlans();
      setPlans(Array.isArray(result) ? result : []);
      setStatus('succeeded');
    } catch {
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const activeUser = user || probedUser;

  if (activeUser) {
    return <Navigate to={landingPathFor(myPermissions, activeUser.role)} replace />;
  }

  const featuredIndex = plans.length > 0 ? Math.floor(plans.length / 2) : -1;

  // Modules present in every plan — shown as the "included everywhere" strip.
  const commonModules = (() => {
    if (plans.length < 2) return [];
    const sets = plans.map(
      (p) => new Set((p.modules || []).map((m) => String(m).toLowerCase())),
    );
    return [...sets[0]].filter((m) => sets.every((s) => s.has(m)));
  })();

  const whatsappGeneralHref = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        t('pricing.whatsappGeneral'),
      )}`
    : null;

  const faqs = [
    { q: t('pricing.faq1Q'), a: t('pricing.faq1A') },
    { q: t('pricing.faq2Q'), a: t('pricing.faq2A') },
    { q: t('pricing.faq3Q'), a: t('pricing.faq3A') },
  ];

  const steps = [
    { n: '1', title: t('pricing.step1Title'), desc: t('pricing.step1Desc') },
    { n: '2', title: t('pricing.step2Title'), desc: t('pricing.step2Desc') },
    { n: '3', title: t('pricing.step3Title'), desc: t('pricing.step3Desc') },
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/80">
        <Link to="/" aria-label="DentoCare home">
          <DentoCareLogo width={150} height={40} />
        </Link>
        <div className="ms-auto flex items-center gap-3">
          <PreferencesControls />
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98] dark:bg-brand dark:hover:bg-brand-dark"
          >
            {t('pricing.signIn')}
          </Link>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <div className="pointer-events-none absolute -top-10 start-1/4 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -end-10 h-72 w-72 rounded-full bg-smile/15 blur-3xl dark:bg-smile/5" />

        {/* Hero */}
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase dark:text-brand-light">
            {t('pricing.badge')}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            {t('pricing.title')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {t('pricing.subtitle')}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {status === 'succeeded' && plans.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark ring-1 ring-brand/20 dark:bg-brand/15 dark:text-brand-light dark:ring-brand/30">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand dark:bg-brand-light" />
                </span>
                {t('pricing.availablePlans', { n: formatNumber(plans.length) })}
              </span>
            )}
            {whatsappGeneralHref && (
              <a
                href={whatsappGeneralHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-brand/30 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-brand-light"
              >
                <WhatsAppIcon />
                {t('pricing.talkToUs')}
              </a>
            )}
          </div>
        </div>

        {/* Plans */}
        <div id="plans" className="relative mt-10 scroll-mt-24">
          {status === 'loading' && (
            <>
              <p className="sr-only" role="status">
                {t('pricing.loading')}
              </p>
              <div className="grid gap-5 md:grid-cols-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <PlanCardSkeleton key={i} />
                ))}
              </div>
            </>
          )}

          {status === 'failed' && (
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t('pricing.loadFailed')}
              </p>
              <button
                type="button"
                onClick={loadPlans}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98] dark:bg-brand dark:hover:bg-brand-dark"
              >
                {t('common.tryAgain')}
              </button>
            </div>
          )}

          {status === 'succeeded' && plans.length === 0 && (
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <EmptyState title={t('pricing.empty')} description={t('pricing.emptyHint')} />
            </div>
          )}

          {status === 'succeeded' && plans.length > 0 && (
            <div
              className={`grid gap-5 ${
                plans.length === 1
                  ? 'mx-auto max-w-md'
                  : plans.length === 2
                    ? 'mx-auto max-w-3xl md:grid-cols-2'
                    : 'md:grid-cols-3'
              }`}
            >
              {plans.map((plan, i) => {
                const featured = i === featuredIndex && plans.length > 1;
                const limits = plan.limits || {};
                const limitItems = [
                  limits.maxBranches != null &&
                    t('pricing.limit.branches', { n: formatNumber(limits.maxBranches) }),
                  limits.maxDoctors != null &&
                    t('pricing.limit.doctors', { n: formatNumber(limits.maxDoctors) }),
                  limits.maxPatients != null &&
                    t('pricing.limit.patients', { n: formatNumber(limits.maxPatients) }),
                  limits.storage && t('pricing.limit.storage', { n: limits.storage }),
                ].filter(Boolean);
                const intervalKey =
                  plan.interval === 'year' ? 'pricing.perYear' : 'pricing.perMonth';
                const ctaHref = WHATSAPP_NUMBER
                  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                      t('pricing.whatsappMsg', { name: plan.name }),
                    )}`
                  : '/login';
                const ctaCls = `mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                  featured
                    ? 'bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-dark dark:bg-brand dark:hover:bg-brand-dark'
                    : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand/30 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`;
                return (
                  <div
                    key={plan._id || plan.key || plan.name}
                    className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 dark:bg-slate-900 ${
                      featured
                        ? 'border-brand shadow-lg shadow-brand/10 ring-1 ring-brand/30 lg:scale-[1.03] dark:border-brand dark:ring-brand/40'
                        : 'border-slate-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-700'
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-3 start-6 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                        {t('pricing.popular')}
                      </span>
                    )}
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {plan.name}
                    </h2>
                    {plan.key && (
                      <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
                        {plan.key}
                      </p>
                    )}
                    <p className="mt-4 flex items-baseline gap-1.5" dir="ltr">
                      <span className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {formatMoney(plan.price)}
                      </span>
                      <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-bold text-brand-dark dark:bg-brand/20 dark:text-brand-light">
                        {t('pricing.currency')}
                      </span>
                      <span className="text-sm text-slate-400 dark:text-slate-500">
                        / {t(intervalKey)}
                      </span>
                    </p>

                    {limitItems.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {limitItems.map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand-dark ring-1 ring-brand/10 dark:bg-brand/15 dark:text-brand-light dark:ring-brand/20"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    {(plan.features?.length > 0 || plan.modules?.length > 0) && (
                      <p className="mt-5 text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                        {t('pricing.whatsIncluded')}
                      </p>
                    )}
                    <ul className="mt-2 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                      {(plan.features || []).map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2">
                          <CheckIcon />
                          <span>{f}</span>
                        </li>
                      ))}
                      {(plan.modules || []).map((m) => (
                        <li key={`mod-${m}`} className="flex items-start gap-2">
                          <CheckIcon />
                          <span className="capitalize">{String(m).replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                    </ul>

                    {plan.support && (
                      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                        {t('pricing.support', { level: plan.support })}
                      </p>
                    )}

                    {WHATSAPP_NUMBER ? (
                      <a
                        href={ctaHref}
                        target="_blank"
                        rel="noreferrer"
                        className={ctaCls}
                      >
                        <WhatsAppIcon />
                        {t('pricing.choosePlan', { name: plan.name })}
                      </a>
                    ) : (
                      <Link to="/login" className={ctaCls}>
                        {t('pricing.choosePlan', { name: plan.name })}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Included everywhere */}
        {status === 'succeeded' && commonModules.length > 0 && (
          <div className="relative mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white/70 p-5 text-center shadow-sm backdrop-blur-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              {t('pricing.commonTitle')}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {commonModules.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                >
                  <CheckIcon />
                  <span className="capitalize">{m.replace(/_/g, ' ')}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="relative mx-auto mt-12 max-w-4xl">
          <h2 className="text-center text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('pricing.stepsTitle')}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-sm shadow-brand/25">
                  {s.n}
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                  {s.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="relative mx-auto mt-12 max-w-2xl">
          <h2 className="text-center text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('pricing.faqTitle')}
          </h2>
          <div className="mt-6 space-y-3">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-slate-800 marker:hidden dark:text-slate-100 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand transition-transform group-open:rotate-45 dark:bg-brand/20 dark:text-brand-light"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="relative mx-auto mt-12 max-w-2xl overflow-hidden rounded-2xl bg-brand-dark p-6 text-center shadow-lg shadow-brand/20 sm:p-8 dark:bg-[#0e1c17] dark:ring-1 dark:ring-brand/30">
          <div className="pointer-events-none absolute -top-16 start-1/4 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <h2 className="relative text-lg font-semibold text-white">
            {t('pricing.ctaTitle')}
          </h2>
          <p className="relative mt-1 text-sm text-white/70">
            {t('pricing.ctaSubtitle')}
          </p>
          <div className="relative mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark shadow-sm transition-all hover:bg-brand-light/30 active:scale-[0.98] sm:w-auto"
            >
              {t('pricing.ctaButton')}
            </Link>
            {whatsappGeneralHref && (
              <a
                href={whatsappGeneralHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98] sm:w-auto"
              >
                <WhatsAppIcon />
                {t('pricing.talkToUs')}
              </a>
            )}
          </div>
        </div>

      </main>

      <footer className="border-t border-slate-200 py-5 dark:border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-400 sm:flex-row sm:px-6 dark:text-slate-500">
          <span>DentoCare · {t('pricing.footer')}</span>
          <span className="flex items-center gap-4">
            <Link to="/login" className="transition-colors hover:text-brand-dark dark:hover:text-brand-light">
              {t('pricing.signIn')}
            </Link>
            {whatsappGeneralHref && (
              <a
                href={whatsappGeneralHref}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-brand-dark dark:hover:text-brand-light"
              >
                {t('pricing.talkToUs')}
              </a>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
