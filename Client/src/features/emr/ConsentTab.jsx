import { useCallback, useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import api from '../../lib/axios';
import { errPayload } from '../../lib/errors';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/format';
import { useCanManageEmr } from '../../lib/roles';

const PAGE_SIZE = 20;

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  signed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  declined: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  withdrawn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  expired: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

function StatusBadge({ status }) {
  const { t } = useT();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {t(`emr.consents.status.${status}`)}
    </span>
  );
}

/**
 * Read-only view of a patient's consents.
 *
 * The server exposes the full lifecycle (create, send, sign, decline, withdraw,
 * verify, delete) under `consents:*` permissions, but the client had no surface
 * for it at all - the EMR tab bar went straight from prescriptions to the wallet,
 * so a signed consent was invisible to the clinician treating the patient. This
 * renders the list; the mutating actions still live in the consent module.
 *
 * A failed load is shown inline with a retry rather than left blank, because a
 * silently empty list is indistinguishable from "this patient has no consents".
 */
export default function ConsentTab({ patientId }) {
  const { t } = useT();
  const canManage = useCanManageEmr();

  const [consents, setConsents] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!patientId) return undefined;
    let active = true;
    setStatus('loading');
    setError('');
    api
      .get(`/patients/${patientId}/consents`, { params: { page: 1, limit: PAGE_SIZE } })
      .then((r) => {
        if (!active) return;
        const data = r.data?.data;
        setConsents(Array.isArray(data?.consents) ? data.consents : []);
        setStatus('succeeded');
      })
      .catch((err) => {
        if (!active) return;
        setConsents([]);
        setError(errPayload(err, 'Failed to load consents').message);
        setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [patientId, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (status === 'loading') {
    return <Spinner label={t('emr.consents.loading')} />;
  }

  if (status === 'failed') {
    return (
      <Card>
        <p className="text-sm text-red-600 dark:text-red-400">{error || t('emr.consents.loadFailed')}</p>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={retry}>
            {t('emr.consents.retry')}
          </Button>
        </div>
      </Card>
    );
  }

  if (consents.length === 0) {
    return <EmptyState title={t('emr.consents.empty')} message={t('emr.consents.emptyMsg')} />;
  }

  return (
    <div className="space-y-3">
      {!canManage && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('emr.consents.readOnly')}</p>
      )}

      {consents.map((c) => (
        <Card key={c._id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t(`emr.consents.type.${c.type}`)}
                {typeof c.version === 'number' && ` · ${t('emr.consents.version', { n: c.version })}`}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </div>

          {c.summary && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t('emr.consents.summary')}: </span>
              {c.summary}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-4">
            {c.createdAt && (
              <div>
                <dt className="inline font-medium">{t('emr.consents.createdAt')}: </dt>
                <dd className="inline">{formatDate(c.createdAt)}</dd>
              </div>
            )}
            {c.signedAt && (
              <div>
                <dt className="inline font-medium">{t('emr.consents.signedAt')}: </dt>
                <dd className="inline">{formatDate(c.signedAt)}</dd>
              </div>
            )}
            {c.declinedAt && (
              <div>
                <dt className="inline font-medium">{t('emr.consents.declinedAt')}: </dt>
                <dd className="inline">{formatDate(c.declinedAt)}</dd>
              </div>
            )}
            {c.withdrawnAt && (
              <div>
                <dt className="inline font-medium">{t('emr.consents.withdrawnAt')}: </dt>
                <dd className="inline">{formatDate(c.withdrawnAt)}</dd>
              </div>
            )}
            {c.expiresAt && (
              <div>
                <dt className="inline font-medium">{t('emr.consents.expiresAt')}: </dt>
                <dd className="inline">{formatDate(c.expiresAt)}</dd>
              </div>
            )}
          </dl>
        </Card>
      ))}
    </div>
  );
}
