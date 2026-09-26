import { useT } from '../lib/i18n';

/**
 * Full-viewport loading state for the auth gates. One component so the
 * "Loading…" string, its colours and its dark-mode treatment cannot drift
 * between the session guard and the permission guard — the route guard used to
 * render `null` (a bare white frame) while the session guard rendered its own
 * hardcoded English label.
 */
export default function FullPageLoader() {
  const { t } = useT();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas dark:bg-slate-950">
      <div className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</div>
    </div>
  );
}
