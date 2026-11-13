import { useCallback, useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { Field, inputCls } from '../../components/ui/Field';
import api from '../../lib/axios';
import { errPayload } from '../../lib/errors';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/format';
import { usePermission } from '../../lib/roles';
import { useSocketEvent } from '../../lib/socket';
import { SOCKET_EVENTS } from '../../lib/socketEvents';
import { pushToast, showErrorDialog } from '../ui/uiSlice';
import { requestConfirm } from '../ui/confirmDialog';
import { useDispatch } from 'react-redux';

const PAGE_SIZE = 20;
const CONSENT_TYPES = ['treatment', 'imaging', 'anesthesia', 'financial', 'general', 'electronic_communication'];
const SIGNATURE_METHODS = ['typed', 'drawn', 'otp', 'staff_photo', 'patient_photo'];

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
      {t(`emr.consents.status.${status}`) || status}
    </span>
  );
}

function emptyForm() {
  return {
    type: 'treatment',
    title: '',
    summary: '',
    termsText: '',
    attachmentUrl: '',
    expiresAt: '',
    status: 'draft',
  };
}

function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalValue(val) {
  if (!val) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function buildPayload(form, { includeStatus } = {}) {
  const payload = {
    type: form.type,
    title: form.title?.trim(),
    summary: form.summary?.trim() || undefined,
    termsText: form.termsText?.trim() || undefined,
    attachmentUrl: form.attachmentUrl?.trim() || undefined,
    expiresAt: fromDateTimeLocalValue(form.expiresAt),
  };
  if (includeStatus && (form.status === 'draft' || form.status === 'sent')) payload.status = form.status;
  return payload;
}

export default function ConsentTab({ patientId }) {
  const { t } = useT();
  const dispatch = useDispatch();
  const canRead = usePermission('consents', 'read');
  const canCreate = usePermission('consents', 'create');
  const canUpdate = usePermission('consents', 'update');
  const canDelete = usePermission('consents', 'delete');
  const canManage = canCreate || canUpdate || canDelete;

  const [consents, setConsents] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [signOpen, setSignOpen] = useState(false);
  const [signTarget, setSignTarget] = useState(null);
  const [signMethod, setSignMethod] = useState('typed');
  const [signerName, setSignerName] = useState('');
  const [signerRelation, setSignerRelation] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [signError, setSignError] = useState('');
  const [signing, setSigning] = useState(false);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async (activeRef) => {
    if (!patientId || !canRead) return;
    setStatus('loading');
    setError('');
    try {
      const r = await api.get(`/patients/${patientId}/consents`, { params: { page: 1, limit: PAGE_SIZE } });
      if (activeRef && !activeRef.current) return;
      const data = r.data?.data;
      setConsents(Array.isArray(data?.consents) ? data.consents : []);
      setStatus('succeeded');
    } catch (err) {
      if (activeRef && !activeRef.current) return;
      setConsents([]);
      setError(errPayload(err, 'Failed to load consents').message);
      setStatus('failed');
    }
  }, [patientId, canRead]);

  useEffect(() => {
    if (!patientId || !canRead) {
      setStatus(canRead ? 'idle' : 'succeeded');
      return undefined;
    }
    const activeRef = { current: true };
    load(activeRef);
    return () => { activeRef.current = false; };
  }, [patientId, reloadKey, load, canRead]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const onConsentChanged = useCallback((payload) => {
    const consent = payload?.consent;
    if (!consent) return;
    const changedPatientId = String(consent.patient?._id ?? consent.patient ?? '');
    if (changedPatientId && String(patientId) !== changedPatientId) return;
    // Reconcile from server to keep history/timestamps accurate without guessing payload shape.
    setReloadKey((k) => k + 1);
  }, [patientId]);

  useSocketEvent(SOCKET_EVENTS.CONSENT_CREATED, onConsentChanged);
  useSocketEvent(SOCKET_EVENTS.CONSENT_UPDATED, onConsentChanged);
  useSocketEvent(SOCKET_EVENTS.CONSENT_SIGNED, onConsentChanged);
  useSocketEvent(SOCKET_EVENTS.CONSENT_DECLINED, onConsentChanged);
  useSocketEvent(SOCKET_EVENTS.CONSENT_WITHDRAWN, onConsentChanged);
  useSocketEvent(SOCKET_EVENTS.CONSENT_DELETED, onConsentChanged);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      type: c.type || 'treatment',
      title: c.title || '',
      summary: c.summary || '',
      termsText: c.termsText || '',
      attachmentUrl: c.attachmentUrl || '',
      expiresAt: toDateTimeLocalValue(c.expiresAt),
      status: c.status === 'sent' ? 'sent' : 'draft',
    });
    setFormError('');
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (saving) return;
    setFormError('');
    if (!form.title?.trim()) {
      setFormError(t('common.nameRequired') || 'Title is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?._id) {
        const payload = buildPayload(form, { includeStatus: true });
        await api.patch(`/patients/${patientId}/consents/${editing._id}`, payload);
      } else {
        const payload = buildPayload(form, { includeStatus: false });
        await api.post(`/patients/${patientId}/consents`, payload);
      }
      dispatch(pushToast({ type: 'success', message: t('emr.consents.saved') || 'Consent saved.' }));
      setFormOpen(false);
      setEditing(null);
      retry();
    } catch (err) {
      const payload = errPayload(err, 'Failed to save consent');
      setFormError(payload.message);
      // preserve form values on failure (do not close/reset)
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id, fn, successMessage) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await fn();
      if (successMessage) dispatch(pushToast({ type: 'success', message: successMessage }));
      retry();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setBusyId(null);
    }
  };

  const sendOtp = async (c) => {
    await runAction(c._id, async () => {
      await api.post(`/patients/${patientId}/consents/${c._id}/send-otp`);
    }, t('emr.consents.otpSent') || 'OTP sent.');
  };

  const markDeclined = async (c) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('emr.consents.declineConfirm') || 'Mark this consent as declined?',
      danger: true,
    });
    if (!ok) return;
    await runAction(c._id, async () => {
      await api.patch(`/patients/${patientId}/consents/${c._id}/decline`, {});
    }, t('emr.consents.declinedMsg') || 'Consent marked as declined.');
  };

  const withdraw = async (c) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('emr.consents.withdrawConfirm') || 'Withdraw this signed consent?',
      danger: true,
    });
    if (!ok) return;
    await runAction(c._id, async () => {
      await api.patch(`/patients/${patientId}/consents/${c._id}/withdraw`, { reason: 'Withdrawn from UI' });
    }, t('emr.consents.withdrawnMsg') || 'Consent withdrawn.');
  };

  const remove = async (c) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('emr.consents.deleteConfirm') || 'Delete this draft/sent consent?',
      danger: true,
    });
    if (!ok) return;
    await runAction(c._id, async () => {
      await api.delete(`/patients/${patientId}/consents/${c._id}`);
    }, t('emr.consents.deleted') || 'Consent deleted.');
  };

  const openDetails = async (c) => {
    setDetailsOpen(true);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const r = await api.get(`/patients/${patientId}/consents/${c._id}`);
      setDetails(r.data?.data?.consent || r.data?.data || c);
    } catch (err) {
      setDetails({ ...c, _loadError: errPayload(err, 'Failed to load consent details').message });
    } finally {
      setDetailsLoading(false);
    }
  };

  const openSign = (c) => {
    setSignTarget(c);
    setSignMethod('typed');
    setSignerName('');
    setSignerRelation('');
    setOtpCode('');
    setSignError('');
    setSignOpen(true);
  };

  const submitSign = async () => {
    if (!signTarget?._id || signing) return;
    setSignError('');
    if (!signerName.trim()) {
      setSignError(t('emr.consents.signerRequired') || 'Signer name is required.');
      return;
    }
    if (signMethod === 'otp' && !otpCode.trim()) {
      setSignError(t('emr.consents.otpRequired') || 'OTP code is required for OTP signature.');
      return;
    }
    setSigning(true);
    try {
      const payload = {
        method: signMethod,
        signerName: signerName.trim(),
        signerRelation: signerRelation.trim() || undefined,
      };
      if (signMethod === 'otp') payload.otpCode = otpCode.trim();
      await api.post(`/patients/${patientId}/consents/${signTarget._id}/sign`, payload);
      dispatch(pushToast({ type: 'success', message: t('emr.consents.signedMsg') || 'Consent signed.' }));
      setSignOpen(false);
      setSignTarget(null);
      retry();
    } catch (err) {
      setSignError(errPayload(err, 'Failed to sign consent').message);
    } finally {
      setSigning(false);
    }
  };

  const openVerify = async (c) => {
    setVerifyResult(null);
    setVerifyOpen(true);
    setVerifying(true);
    try {
      const r = await api.post(`/patients/${patientId}/consents/${c._id}/verify`);
      setVerifyResult(r.data?.data || r.data || { ok: true });
    } catch (err) {
      setVerifyResult({ error: errPayload(err, 'Verification failed').message });
    } finally {
      setVerifying(false);
    }
  };

  if (!canRead) {
    return <EmptyState title={t('common.accessDenied') || 'Access denied'} message={t('emr.consents.noAccess') || 'You do not have permission to view consents.'} />;
  }

  if (status === 'loading') return <Spinner label={t('emr.consents.loading')} />;

  if (status === 'failed') {
    return (
      <Card>
        <p className="text-sm text-red-600 dark:text-red-400">{error || t('emr.consents.loadFailed')}</p>
        <div className="mt-3"><Button type="button" variant="secondary" onClick={retry}>{t('emr.consents.retry')}</Button></div>
      </Card>
    );
  }

  const renderActions = (c) => {
    const isBusy = busyId === c._id;
    const editable = c.status === 'draft' || c.status === 'sent';
    const signable = c.status === 'draft' || c.status === 'sent';
    const withdrawable = c.status === 'signed';
    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Button variant="secondary" onClick={() => openDetails(c)} disabled={isBusy}>{t('common.details') || 'Details'}</Button>
        {canUpdate && editable && <Button variant="secondary" onClick={() => openEdit(c)} disabled={isBusy}>{t('common.edit')}</Button>}
        {canUpdate && signable && <Button variant="secondary" onClick={() => openSign(c)} disabled={isBusy}>{t('emr.consents.sign') || 'Sign'}</Button>}
        {canUpdate && signable && <Button variant="secondary" onClick={() => sendOtp(c)} disabled={isBusy}>{t('emr.consents.sendOtp') || 'Send OTP'}</Button>}
        {canUpdate && signable && <Button variant="secondary" onClick={() => markDeclined(c)} disabled={isBusy}>{t('emr.consents.decline') || 'Decline'}</Button>}
        {canUpdate && withdrawable && <Button variant="secondary" onClick={() => withdraw(c)} disabled={isBusy}>{t('emr.consents.withdraw') || 'Withdraw'}</Button>}
        {canUpdate && c.status === 'signed' && <Button variant="secondary" onClick={() => openVerify(c)} disabled={isBusy}>{t('emr.consents.verify') || 'Verify'}</Button>}
        {canDelete && editable && <Button variant="danger" onClick={() => remove(c)} disabled={isBusy}>{t('common.delete')}</Button>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('emr.consents.subtitle') || 'Patient consents, status, and e-signature actions.'}</p>
        {canCreate && <Button onClick={openCreate}>{t('emr.consents.new') || '+ New Consent'}</Button>}
      </div>

      {consents.length === 0 && <EmptyState title={t('emr.consents.empty')} message={t('emr.consents.emptyMsg')} />}

      {consents.map((c) => (
        <Card key={c._id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t(`emr.consents.type.${c.type}`) || c.type}
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
            {c.createdAt && <div><dt className="inline font-medium">{t('emr.consents.createdAt')}: </dt><dd className="inline">{formatDate(c.createdAt)}</dd></div>}
            {c.signedAt && <div><dt className="inline font-medium">{t('emr.consents.signedAt')}: </dt><dd className="inline">{formatDate(c.signedAt)}</dd></div>}
            {c.declinedAt && <div><dt className="inline font-medium">{t('emr.consents.declinedAt')}: </dt><dd className="inline">{formatDate(c.declinedAt)}</dd></div>}
            {c.withdrawnAt && <div><dt className="inline font-medium">{t('emr.consents.withdrawnAt')}: </dt><dd className="inline">{formatDate(c.withdrawnAt)}</dd></div>}
            {c.expiresAt && <div><dt className="inline font-medium">{t('emr.consents.expiresAt')}: </dt><dd className="inline">{formatDate(c.expiresAt)}</dd></div>}
          </dl>

          {canManage && renderActions(c)}
        </Card>
      ))}

      {/* Create/Edit */}
      <Modal
        open={formOpen}
        title={editing ? (t('emr.consents.edit') || 'Edit Consent') : (t('emr.consents.new') || 'New Consent')}
        onClose={() => { if (!saving) setFormOpen(false); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={submitForm} disabled={saving}>{saving ? (t('common.saving') || 'Saving…') : t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('emr.consents.typeLabel') || 'Type'} required htmlFor="consent-type">
              <select id="consent-type" className={inputCls} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={!!editing}>
                {CONSENT_TYPES.map((tp) => <option key={tp} value={tp}>{t(`emr.consents.type.${tp}`) || tp}</option>)}
              </select>
            </Field>
            <Field label={t('emr.consents.statusLabel') || 'Status'} htmlFor="consent-status">
              <select id="consent-status" className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={!editing}>
                <option value="draft">{t('emr.consents.status.draft') || 'Draft'}</option>
                <option value="sent">{t('emr.consents.status.sent') || 'Sent'}</option>
              </select>
            </Field>
          </div>
          <Field label={t('emr.consents.titleLabel') || 'Title'} required htmlFor="consent-title">
            <input id="consent-title" className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
          </Field>
          <Field label={t('emr.consents.summary') || 'Summary'}>
            <textarea className={`${inputCls} min-h-[72px]`} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} maxLength={1000} />
          </Field>
          <Field label={t('emr.consents.termsText') || 'Terms text'}>
            <textarea className={`${inputCls} min-h-[140px]`} value={form.termsText} onChange={(e) => setForm((f) => ({ ...f, termsText: e.target.value }))} maxLength={20000} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('emr.consents.attachmentUrl') || 'Attachment URL'}>
              <input className={inputCls} value={form.attachmentUrl} onChange={(e) => setForm((f) => ({ ...f, attachmentUrl: e.target.value }))} maxLength={1024} />
            </Field>
            <Field label={t('emr.consents.expiresAt') || 'Expires at'}>
              <input type="datetime-local" className={inputCls} value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </Field>
          </div>
          {editing && <p className="text-xs text-slate-500 dark:text-slate-400">{t('emr.consents.editHint') || 'Only draft/sent consents can be updated; signed records are frozen by the server.'}</p>}
        </div>
      </Modal>

      {/* Details */}
      <Modal open={detailsOpen} title={t('emr.consents.details') || 'Consent details'} onClose={() => setDetailsOpen(false)} size="lg" footer={<Button variant="secondary" onClick={() => setDetailsOpen(false)}>{t('common.close')}</Button>}>
        {detailsLoading && <Spinner label={t('common.loading') || 'Loading…'} />}
        {!detailsLoading && details && (
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            {details._loadError && <p className="text-red-600 dark:text-red-400">{details._loadError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{details.title}</span>
              {details.status && <StatusBadge status={details.status} />}
            </div>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">{t('emr.consents.typeLabel') || 'Type'}</dt><dd>{t(`emr.consents.type.${details.type}`) || details.type || '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('emr.consents.versionLabel') || 'Version'}</dt><dd>{details.version ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('emr.consents.createdAt')}</dt><dd>{details.createdAt ? formatDate(details.createdAt) : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('emr.consents.updatedAt') || 'Updated'}</dt><dd>{details.updatedAt ? formatDate(details.updatedAt) : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('emr.consents.signedAt')}</dt><dd>{details.signedAt ? formatDate(details.signedAt) : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('emr.consents.expiresAt')}</dt><dd>{details.expiresAt ? formatDate(details.expiresAt) : '—'}</dd></div>
            </dl>
            {details.summary && <div><p className="text-xs text-slate-500">{t('emr.consents.summary')}</p><p className="whitespace-pre-wrap">{details.summary}</p></div>}
            {details.termsText && <div><p className="text-xs text-slate-500">{t('emr.consents.termsText') || 'Terms text'}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">{details.termsText}</pre></div>}
            {details.signature && (
              <div>
                <p className="text-xs text-slate-500">{t('emr.consents.signature') || 'Signature'}</p>
                <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">{JSON.stringify(details.signature, null, 2)}</pre>
              </div>
            )}
            {details.attachmentUrl && <div><p className="text-xs text-slate-500">{t('emr.consents.attachmentUrl') || 'Attachment URL'}</p><a className="text-brand underline break-all" href={details.attachmentUrl} target="_blank" rel="noreferrer">{details.attachmentUrl}</a></div>}
          </div>
        )}
      </Modal>

      {/* Sign */}
      <Modal
        open={signOpen}
        title={t('emr.consents.signTitle') || 'Sign consent'}
        onClose={() => { if (!signing) setSignOpen(false); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSignOpen(false)} disabled={signing}>{t('common.cancel')}</Button>
            <Button onClick={submitSign} disabled={signing}>{signing ? (t('common.saving') || 'Saving…') : (t('emr.consents.sign') || 'Sign')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {signError && <p className="text-sm text-red-600 dark:text-red-400">{signError}</p>}
          <p className="text-sm text-slate-600 dark:text-slate-300">{signTarget?.title}</p>
          <Field label={t('emr.consents.method') || 'Method'}>
            <select className={inputCls} value={signMethod} onChange={(e) => setSignMethod(e.target.value)}>
              {SIGNATURE_METHODS.map((m) => <option key={m} value={m}>{t(`emr.consents.method.${m}`) || m}</option>)}
            </select>
          </Field>
          <Field label={t('emr.consents.signerName') || 'Signer name'} required>
            <input className={inputCls} value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </Field>
          <Field label={t('emr.consents.signerRelation') || 'Relation'}>
            <input className={inputCls} value={signerRelation} onChange={(e) => setSignerRelation(e.target.value)} placeholder={t('emr.consents.signerRelationHint') || 'e.g. self, parent, guardian'} />
          </Field>
          {signMethod === 'otp' && (
            <Field label={t('emr.consents.otpCode') || 'OTP code'} required hint={t('emr.consents.otpHint') || 'Use “Send OTP” first if required.'}>
              <input className={inputCls} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
            </Field>
          )}
        </div>
      </Modal>

      {/* Verify */}
      <Modal open={verifyOpen} title={t('emr.consents.verifyTitle') || 'Verify consent signature'} onClose={() => setVerifyOpen(false)} footer={<Button variant="secondary" onClick={() => setVerifyOpen(false)}>{t('common.close')}</Button>}>
        {verifying && <Spinner label={t('common.loading') || 'Loading…'} />}
        {!verifying && verifyResult && (
          <div className="space-y-2">
            {verifyResult.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{verifyResult.error}</p>
            ) : (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{t('emr.consents.verifyOk') || 'Signature verification completed.'}</p>
            )}
            <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">{JSON.stringify(verifyResult, null, 2)}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
