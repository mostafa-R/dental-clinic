import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { Field, inputCls } from '../components/ui/Field';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import DataTable from '../components/ui/DataTable';
import {
  fetchAutomations,
  fetchAutomationTriggers,
  fetchAutomationRuns,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  installAutomationTemplates,
  testAutomation,
  resetAutomationFormState,
  resetAutomationTestState,
} from '../features/automations/automationSlice';
import { fetchBranches } from '../features/branches/branchSlice';
import { pushToast, showErrorDialog } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { useT } from '../lib/i18n';
import { usePermission } from '../lib/roles';
import { formatDate } from '../lib/format';

function defaultForm(triggers) {
  return {
    name: '',
    description: '',
    triggerType: triggers?.[0]?.key || '',
    branch: '',
    enabled: true,
    cooldownMinutes: 0,
    conditionsJson: '[]',
    actionsJson: JSON.stringify([{ type: 'notify_branch', config: { message: 'Automation triggered' } }], null, 2),
    testEventJson: '{}',
  };
}

function toForm(automation, triggers) {
  return {
    name: automation?.name || '',
    description: automation?.description || '',
    triggerType: automation?.trigger?.type || triggers?.[0]?.key || '',
    branch: automation?.branch?._id || automation?.branch || '',
    enabled: automation?.enabled !== false,
    cooldownMinutes: automation?.cooldownMinutes ?? 0,
    conditionsJson: JSON.stringify(automation?.conditions || [], null, 2),
    actionsJson: JSON.stringify(automation?.actions || [], null, 2),
    testEventJson: '{}',
  };
}

export default function Automations() {
  const dispatch = useDispatch();
  const { t } = useT();
  const canRead = usePermission('automations', 'read');
  const canCreate = usePermission('automations', 'create');
  const canUpdate = usePermission('automations', 'update');
  const canDelete = usePermission('automations', 'delete');

  const {
    items, status, error, triggers, runs, runsStatus, runsError,
    formStatus, formError, testStatus, testError, testResult,
  } = useSelector((s) => s.automations);
  const branches = useSelector((s) => s.branches?.items || []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => defaultForm([]));
  const [localError, setLocalError] = useState('');
  const [runsFor, setRunsFor] = useState(null);

  const busy = formStatus === 'loading';
  const testing = testStatus === 'loading';

  const loadAll = useCallback(() => {
    if (!canRead) return;
    dispatch(fetchAutomations());
    dispatch(fetchAutomationTriggers());
    dispatch(fetchBranches({ page: 1, limit: 100 }));
  }, [dispatch, canRead]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!formOpen) return;
    dispatch(resetAutomationFormState());
    dispatch(resetAutomationTestState());
    setLocalError('');
  }, [formOpen, dispatch]);

  const triggerLabel = useMemo(() => {
    const map = new Map((triggers || []).map((tr) => [tr.key, tr.label]));
    return (key) => map.get(key) || key || '—';
  }, [triggers]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm(triggers));
    setLocalError('');
    dispatch(resetAutomationFormState());
    dispatch(resetAutomationTestState());
    setFormOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm(toForm(a, triggers));
    setLocalError('');
    dispatch(resetAutomationFormState());
    dispatch(resetAutomationTestState());
    setFormOpen(true);
  };

  const closeForm = () => {
    if (busy || testing) return;
    setFormOpen(false);
    setEditing(null);
  };

  const parseJsonField = (value, fallback) => {
    const raw = (value || '').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  };

  const submit = async () => {
    if (busy) return;
    setLocalError('');
    let conditions;
    let actions;
    try {
      conditions = parseJsonField(form.conditionsJson, []);
      actions = parseJsonField(form.actionsJson, []);
      if (!Array.isArray(conditions) || !Array.isArray(actions)) throw new Error('not-array');
    } catch {
      setLocalError(t('automations.form.invalidJson') || 'Actions/conditions must be valid JSON arrays.');
      return;
    }
    if (!form.name.trim()) {
      setLocalError(t('common.nameRequired') || 'Name is required.');
      return;
    }
    if (!form.triggerType) {
      setLocalError(t('automations.form.triggerRequired') || 'Trigger is required.');
      return;
    }
    if (actions.length === 0) {
      setLocalError(t('automations.form.actionsRequired') || 'At least one action is required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      trigger: { type: form.triggerType },
      conditions,
      actions,
      enabled: !!form.enabled,
      cooldownMinutes: Number(form.cooldownMinutes) || 0,
      branch: form.branch || undefined,
    };

    try {
      if (editing?._id) {
        await dispatch(updateAutomation({ id: editing._id, payload })).unwrap();
      } else {
        await dispatch(createAutomation(payload)).unwrap();
      }
      dispatch(pushToast({ type: 'success', message: t('automations.saved') || 'Automation saved.' }));
      setFormOpen(false);
      setEditing(null);
      dispatch(fetchAutomations());
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onDelete = async (a) => {
    if (!canDelete) return;
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: (t('automations.deleteConfirm') || 'Delete automation "{name}"?').replace('{name}', a.name || ''),
      danger: true,
    });
    if (!ok) return;
    try {
      await dispatch(deleteAutomation(a._id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t('automations.deleted') || 'Automation deleted.' }));
      dispatch(fetchAutomations());
      if (runsFor?._id === a._id) setRunsFor(null);
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onInstallTemplates = async () => {
    if (!canCreate || busy) return;
    try {
      const res = await dispatch(installAutomationTemplates()).unwrap();
      const count = res?.installed?.length ?? res?.count ?? '';
      dispatch(pushToast({
        type: 'success',
        message: count !== '' ? `${t('automations.templatesInstalled') || 'Templates installed'} (${count})` : (t('automations.templatesInstalled') || 'Templates installed'),
      }));
      dispatch(fetchAutomations());
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onTest = async () => {
    if (!editing?._id) {
      setLocalError(t('automations.form.createFirst') || 'Save the automation before testing.');
      return;
    }
    if (busy || testing) return;
    let eventData = {};
    try {
      const raw = (form.testEventJson || '').trim();
      eventData = raw ? JSON.parse(raw) : {};
      if (eventData && typeof eventData !== 'object' || Array.isArray(eventData)) throw new Error('bad');
    } catch {
      setLocalError(t('automations.form.invalidJson') || 'Test event data must be a valid JSON object.');
      return;
    }
    setLocalError('');
    try {
      await dispatch(testAutomation({ id: editing._id, payload: { eventData } })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const openRuns = (a) => {
    setRunsFor(a);
    dispatch(fetchAutomationRuns({ automation: a._id, page: 1, limit: 20 }));
  };

  const runStatusTone = (runStatus) => {
    if (runStatus === 'success') return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30';
    if (runStatus === 'failed' || runStatus === 'error') return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30';
    if (runStatus === 'skipped') return 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30';
    return 'text-slate-700 bg-slate-100 dark:text-slate-200 dark:bg-slate-700';
  };

  if (!canRead) {
    return <EmptyState title={t('common.accessDenied') || 'Access denied'} message={t('automations.noAccess') || 'You do not have permission to view automations.'} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('automations.title') || 'Automations'}
        subtitle={t('automations.subtitle') || 'Manage trigger-based rules, templates, and execution history.'}
        actions={canCreate ? (
          <>
            <Button variant="secondary" onClick={onInstallTemplates} disabled={busy}>
              {t('automations.installTemplates') || 'Install Templates'}
            </Button>
            <Button onClick={openCreate}>{t('automations.new') || '+ New Automation'}</Button>
          </>
        ) : null}
      />

      {(status === 'loading' || status === 'idle') && <Spinner label={t('automations.loading') || 'Loading automations…'} />}
      {status === 'failed' && (
        <Card>
          <p className="text-sm text-red-600 dark:text-red-400">{error?.message || t('automations.loadFailed') || "Couldn't load automations"}</p>
          <div className="mt-3"><Button variant="secondary" onClick={loadAll}>{t('common.retry') || 'Retry'}</Button></div>
        </Card>
      )}
      {status === 'succeeded' && items.length === 0 && (
        <EmptyState title={t('automations.empty') || 'No automations yet.'} message={t('automations.emptyHint') || 'Create a rule or install built-in templates.'} />
      )}

      {status === 'succeeded' && items.length > 0 && (
        <DataTable
          columns={[
            { label: t('automations.col.name') || 'Name' },
            { label: t('automations.col.trigger') || 'Trigger' },
            { label: t('automations.col.status') || 'Status' },
            { label: t('automations.col.actions') || 'Actions', className: 'text-end' },
          ]}
          count={items.length}
        >
          {items.map((a) => (
            <tr key={a._id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                {a.description ? <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{a.description}</div> : null}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{triggerLabel(a.trigger?.type)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${a.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {a.enabled ? (t('automations.enabled') || 'Enabled') : (t('automations.disabled') || 'Disabled')}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => openRuns(a)}>{t('automations.runs') || 'Runs'}</Button>
                  {canUpdate && <Button variant="secondary" onClick={() => openEdit(a)}>{t('common.edit')}</Button>}
                  {canDelete && <Button variant="danger" onClick={() => onDelete(a)}>{t('common.delete')}</Button>}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* Runs / history */}
      {runsFor && (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('automations.runHistory') || 'Execution history'}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{runsFor.name}</p>
            </div>
            <Button variant="secondary" onClick={() => setRunsFor(null)}>{t('common.close') || 'Close'}</Button>
          </div>
          {runsStatus === 'loading' && <Spinner label={t('common.loading') || 'Loading…'} />}
          {runsStatus === 'failed' && <p className="text-sm text-red-600 dark:text-red-400">{runsError?.message || t('common.loadFailed') || 'Failed to load'}</p>}
          {runsStatus === 'succeeded' && runs.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('automations.noRuns') || 'No runs found.'}</p>}
          {runsStatus === 'succeeded' && runs.length > 0 && (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${runStatusTone(run.status)}`}>{run.status || '—'}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{triggerLabel(run.trigger?.type || run.triggerType)}</span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{run.createdAt ? formatDate(run.createdAt) : ''}</span>
                  </div>
                  {run.error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{typeof run.error === 'string' ? run.error : (run.error?.message || JSON.stringify(run.error))}</p>}
                  {Array.isArray(run.actions) && run.actions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {run.actions.map((ar, i) => (
                        <div key={i} className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-medium">{ar.type || ar.action || 'action'}</span>: {ar.status || '—'}
                          {ar.error ? <span className="text-red-600 dark:text-red-400"> — {typeof ar.error === 'string' ? ar.error : JSON.stringify(ar.error)}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">{t('common.details') || 'Details'}</summary>
                    <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">{JSON.stringify(run, null, 2)}</pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Create/Edit modal */}
      <Modal
        open={formOpen}
        title={editing ? (t('automations.form.edit') || 'Edit Automation') : (t('automations.form.new') || 'New Automation')}
        onClose={closeForm}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={busy || testing}>{t('common.cancel')}</Button>
            {editing?._id && (
              <Button variant="secondary" onClick={onTest} disabled={busy || testing}>
                {testing ? (t('common.loading') || 'Loading…') : (t('automations.test') || 'Test')}
              </Button>
            )}
            <Button onClick={submit} disabled={busy || testing}>{busy ? (t('common.saving') || 'Saving…') : (t('automations.form.save') || 'Save automation')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {(localError || formError?.message) && (
            <p className="text-sm text-red-600 dark:text-red-400">{localError || formError?.message}</p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('automations.form.name') || 'Name'} required>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} />
            </Field>
            <Field label={t('automations.form.trigger') || 'Trigger'} required>
              <select className={inputCls} value={form.triggerType} onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value }))}>
                <option value="">{t('common.select') || 'Select'}</option>
                {(triggers || []).map((tr) => <option key={tr.key} value={tr.key}>{tr.label || tr.key}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('automations.form.description') || 'Description'}>
            <textarea className={`${inputCls} min-h-[72px]`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('appointments.form.branch') || 'Branch'}>
              <select className={inputCls} value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}>
                <option value="">{t('common.allBranches') || 'All / default'}</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label={t('automations.form.cooldown') || 'Cooldown (minutes)'}>
              <input type="number" min={0} className={inputCls} value={form.cooldownMinutes} onChange={(e) => setForm((f) => ({ ...f, cooldownMinutes: e.target.value }))} />
            </Field>
            <Field label={t('automations.form.enabled') || 'Enabled'}>
              <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                <span>{form.enabled ? (t('automations.enabled') || 'Enabled') : (t('automations.disabled') || 'Disabled')}</span>
              </label>
            </Field>
          </div>
          <Field label={t('automations.form.conditionsJson') || 'Conditions (JSON array)'}>
            <textarea className={`${inputCls} min-h-[120px] font-mono text-xs`} value={form.conditionsJson} onChange={(e) => setForm((f) => ({ ...f, conditionsJson: e.target.value }))} spellCheck={false} />
          </Field>
          <Field label={t('automations.form.actionsJson') || 'Actions (JSON array)'} hint={t('automations.form.actionsHint') || 'Use supported action types from the backend catalog.'}>
            <textarea className={`${inputCls} min-h-[140px] font-mono text-xs`} value={form.actionsJson} onChange={(e) => setForm((f) => ({ ...f, actionsJson: e.target.value }))} spellCheck={false} />
          </Field>
          {editing?._id && (
            <Field label={t('automations.form.testEventJson') || 'Test event data (JSON object, optional)'}>
              <textarea className={`${inputCls} min-h-[100px] font-mono text-xs`} value={form.testEventJson} onChange={(e) => setForm((f) => ({ ...f, testEventJson: e.target.value }))} spellCheck={false} />
            </Field>
          )}
          {testStatus === 'failed' && <p className="text-sm text-red-600 dark:text-red-400">{testError?.message || 'Test failed'}</p>}
          {testStatus === 'succeeded' && testResult && (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t('automations.testResult') || 'Test result'}</p>
              <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          )}
          {!editing?._id && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('automations.form.createFirst') || 'Save the automation before testing.'}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
