import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';

import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import Switch from '../../components/ui/Switch';
import { Field, Select, TextInput, Textarea } from '../../components/ui/Field';
import { BellIcon, InfoIcon, LockIcon, PlugIcon } from '../../components/ui/icons';
import { settingsApi } from './settingsApi';
import { pushToast } from '../ui/uiSlice';
import { requestConfirm } from '../ui/confirmDialog';
import { useT } from '../../lib/i18n';
import { errPayload } from '../../lib/errors';

const PROVIDERS = ['whatsapp_web', 'cloud_api'];
const QR_POLL_MS = 3000;
// A pairing code is short-lived server-side; past this the code is dead and the
// user has to start over, so stop waiting rather than poll indefinitely.
const QR_POLL_TIMEOUT_MS = 60000;

// accessToken is write-only server-side (the controller strips it before
// returning the settings), so it is tracked separately and only sent when the
// user actually typed a new value.
const INITIAL_SETTINGS = {
  enabled: false,
  provider: 'whatsapp_web',
  status: 'disconnected',
  config: { phoneNumber: '', phoneNumberId: '' },
  settings: {
    appointmentReminder: true,
    appointmentConfirm: true,
    reminderHours: 2,
    reminderHoursSecondary: 24,
    installmentReminder: true,
    noShowReminder: true,
    queueNotifications: false,
  },
};

/** The subset of state the Save button persists; `status`/`lastError` are server-owned. */
const editableOf = (s) => ({
  enabled: s.enabled,
  provider: s.provider,
  config: { phoneNumber: s.config?.phoneNumber ?? '', phoneNumberId: s.config?.phoneNumberId ?? '' },
  settings: { ...s.settings },
});

const clamp = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * `qrCode` is interpolated into an <img src>, so a non-data value (a bare token,
 * an http URL from a misconfigured gateway) would either render broken or make
 * the browser fetch an arbitrary origin. Accept only the data URI the pairing
 * flow is supposed to return.
 */
const qrDataUri = (value) => {
  const raw = value == null ? null : String(value);
  return raw && raw.startsWith('data:image/') ? raw : null;
};

export default function WhatsAppSettings() {
  const { t } = useT();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [accessToken, setAccessToken] = useState('');
  const [qrCode, setQrCode] = useState(null);
  const [error, setError] = useState('');
  const [testForm, setTestForm] = useState({ to: '', message: '' });
  // Snapshot of the last state known to be persisted, so Save can tell the user
  // whether there is anything to save at all.
  const [baseline, setBaseline] = useState(() => editableOf(INITIAL_SETTINGS));

  const toastError = useCallback(
    (err, fallbackKey) => {
      const message = errPayload(err, t(fallbackKey)).message;
      setError(message);
      dispatch(pushToast({ type: 'error', message }));
    },
    [dispatch, t],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getWhatsAppSettings();
      if (data) {
        const merged = {
          ...INITIAL_SETTINGS,
          ...data,
          // The GET payload may omit these keys on older records; merging over
          // the defaults keeps every checkbox controlled.
          config: { ...INITIAL_SETTINGS.config, ...(data.config ?? {}) },
          settings: { ...INITIAL_SETTINGS.settings, ...(data.settings ?? {}) },
        };
        setSettings(merged);
        setBaseline(editableOf(merged));
      }
      setError('');
    } catch (err) {
      toastError(err, 'whatsapp.loadFailed');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isCloudApi = settings.provider === 'cloud_api';
  const isConnecting = settings.status === 'connecting';

  // Poll while pairing. `error` is terminal as well — the previous guard only
  // stopped on "connected", so a failed handshake polled forever.
  //
  // The poll is also bounded: `status` can sit at "connecting" indefinitely when
  // the pairing never completes (expired QR, user walks away), which left the
  // panel spinning forever with a dead QR code and no way back except a manual
  // reload.
  useEffect(() => {
    if (!isConnecting) return undefined;
    const stop = () => {
      clearInterval(interval);
      clearTimeout(timeoutId);
    };

    const applyQr = (value) => setQrCode(qrDataUri(value));

    const interval = setInterval(async () => {
      try {
        const qrRes = await settingsApi.getWhatsAppQr();
        applyQr(qrRes?.qrCode);
        const statusRes = await settingsApi.getWhatsAppStatus();
        const next = statusRes?.status;
        setSettings((prev) => ({ ...prev, status: next || prev.status }));
        if (next === 'connected') stop();
      } catch {}
    }, QR_POLL_MS);

    const timeoutId = setTimeout(() => {
      stop();
      setSettings((prev) => ({ ...prev, status: 'disconnected' }));
      setQrCode(null);
      const message = t('whatsapp.qrTimeout');
      setError(message);
      dispatch(pushToast({ type: 'error', message }));
    }, QR_POLL_TIMEOUT_MS);

    return stop;
  }, [isConnecting, dispatch, t]);

  const patch = (updates) => setSettings((prev) => ({ ...prev, ...updates }));

  const patchConfig = (key, value) =>
    setSettings((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));

  const patchSetting = (key, value) =>
    setSettings((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));

  // The model rejects enabled=true without config.phoneNumber, and cloud_api
  // additionally needs phoneNumberId + accessToken.
  const missingCredentials = useMemo(() => {
    if (!settings.enabled) return [];
    const missing = [];
    if (!settings.config?.phoneNumber) missing.push(t('whatsapp.phoneNumber'));
    if (isCloudApi) {
      if (!settings.config?.phoneNumberId) missing.push(t('whatsapp.phoneNumberId'));
      if (!accessToken) missing.push(t('whatsapp.accessToken'));
    }
    return missing;
  }, [settings.enabled, settings.config, isCloudApi, accessToken, t]);

  const credentialsBlocked = missingCredentials.length > 0;

  // A newly-typed token is itself a pending change even though it is not part
  // of the settings document.
  const dirty = useMemo(
    () => JSON.stringify(editableOf(settings)) !== JSON.stringify(baseline) || accessToken !== '',
    [settings, baseline, accessToken],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const data = await settingsApi.updateWhatsAppSettings({
        enabled: settings.enabled,
        provider: settings.provider,
        settings: settings.settings,
        config: {
          ...(settings.config?.phoneNumber
            ? { phoneNumber: settings.config.phoneNumber }
            : {}),
          ...(settings.config?.phoneNumberId
            ? { phoneNumberId: settings.config.phoneNumberId }
            : {}),
          ...(accessToken ? { accessToken } : {}),
        },
      });
      if (data) {
        const merged = {
          ...settings,
          ...data,
          config: { ...settings.config, ...(data.config ?? {}) },
          settings: { ...settings.settings, ...(data.settings ?? {}) },
        };
        setSettings(merged);
        setBaseline(editableOf(merged));
      } else {
        setBaseline(editableOf(settings));
      }
      setAccessToken('');
      setError('');
      dispatch(pushToast({ type: 'success', message: t('whatsapp.saved') }));
    } catch (err) {
      toastError(err, 'whatsapp.failed');
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setSettings((prev) => ({ ...prev, ...baseline, config: { ...baseline.config }, settings: { ...baseline.settings } }));
    setAccessToken('');
    setError('');
  }

  async function handleConnect() {
    setConnecting(true);
    setQrCode(null);
    try {
      await settingsApi.connectWhatsApp();
        const qrRes = await settingsApi.getWhatsAppQr();
        setQrCode(qrDataUri(qrRes?.qrCode));
      const statusRes = await settingsApi.getWhatsAppStatus();
      setSettings((prev) => ({ ...prev, status: statusRes?.status || 'connecting' }));
      setError('');
    } catch (err) {
      toastError(err, 'whatsapp.failed');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    // Disconnecting stops every outgoing message and clears the linked device,
    // so it asks first rather than firing on a single click.
    const ok = await requestConfirm({
      title: t('whatsapp.disconnect'),
      message: t('whatsapp.disconnectConfirm'),
      confirmLabel: t('whatsapp.disconnect'),
      danger: true,
    });
    if (!ok) return;

    setConnecting(true);
    try {
      await settingsApi.disconnectWhatsApp();
      setSettings((prev) => ({ ...prev, status: 'disconnected' }));
      setQrCode(null);
      setError('');
      dispatch(pushToast({ type: 'success', message: t('whatsapp.disconnected') }));
    } catch (err) {
      toastError(err, 'whatsapp.failed');
    } finally {
      setConnecting(false);
    }
  }

  async function handleTestSend(e) {
    e.preventDefault();
    if (!testForm.to || !testForm.message) return;
    setSendingTest(true);
    try {
      await settingsApi.sendTestWhatsApp(testForm);
      dispatch(pushToast({ type: 'success', message: t('whatsapp.sent') }));
      setTestForm({ to: '', message: '' });
    } catch (err) {
      toastError(err, 'whatsapp.failed');
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const isConnected = settings.status === 'connected';

  const statusLabel = isConnected
    ? t('whatsapp.connected')
    : settings.status === 'connecting'
      ? t('whatsapp.connecting')
      : settings.status === 'error'
        ? t('whatsapp.error')
        : t('whatsapp.notConnected');

  const statusTone = isConnected
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300'
    : settings.status === 'connecting'
      ? 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300'
      : settings.status === 'error'
        ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300'
        : 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300';

  return (
    <div className="space-y-6">
      {/* ── Connection ─────────────────────────────────────────────────── */}
      <Card
        title={t('whatsapp.title')}
        action={
          <span
            role="status"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone}`}
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel}
          </span>
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t('whatsapp.desc')}
          </p>

          {/* `role="alert"` so a failed save is announced, not just painted. */}
          {error && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              <span className="shrink-0 text-red-500 dark:text-red-400" aria-hidden="true">
                <InfoIcon width={18} height={18} />
              </span>
              <div className="min-w-0">
                <p>{error}</p>
                {settings.lastError && (
                  <p className="mt-1 text-xs opacity-80">
                    {t('whatsapp.lastError')}: {settings.lastError}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Switch
              id="whatsappEnabled"
              checked={settings.enabled}
              onChange={(next) => patch({ enabled: next })}
              label={t('whatsapp.enabled')}
              description={t('whatsapp.enabledHint')}
            />
          </div>

          {/* The credential fields are disabled while the integration is off
              rather than hidden: turning it back on should not lose the values
              the user already typed. */}
          <fieldset
            disabled={!settings.enabled}
            className="space-y-4 disabled:opacity-60"
          >
            <legend className="sr-only">{t('whatsapp.config')}</legend>

            <Field label={t('whatsapp.provider')} hint={t('whatsapp.providerHint')} htmlFor="whatsappProvider">
              <Select
                id="whatsappProvider"
                value={settings.provider}
                onChange={(e) => patch({ provider: e.target.value })}
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {t(`whatsapp.provider.${provider}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('whatsapp.phoneNumber')} hint={t('whatsapp.configDesc')} htmlFor="whatsappPhoneNumber">
              <TextInput
                id="whatsappPhoneNumber"
                type="tel"
                dir="ltr"
                value={settings.config?.phoneNumber || ''}
                onChange={(e) => patchConfig('phoneNumber', e.target.value)}
                placeholder="+201234567890"
                autoComplete="off"
              />
            </Field>

            {isCloudApi && (
              <>
                <Field label={t('whatsapp.phoneNumberId')} htmlFor="whatsappPhoneNumberId">
                  <TextInput
                    id="whatsappPhoneNumberId"
                    dir="ltr"
                    value={settings.config?.phoneNumberId || ''}
                    onChange={(e) => patchConfig('phoneNumberId', e.target.value)}
                    autoComplete="off"
                  />
                </Field>

                <Field
                  label={t('whatsapp.accessToken')}
                  hint={t('whatsapp.accessTokenHint')}
                  htmlFor="whatsappAccessToken"
                >
                  <div className="relative">
                    <LockIcon
                      width={16}
                      height={16}
                      className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <TextInput
                      id="whatsappAccessToken"
                      type="password"
                      className="ps-9"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="********"
                      autoComplete="new-password"
                    />
                  </div>
                </Field>

                <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-relaxed text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
                  <span className="shrink-0" aria-hidden="true">
                    <InfoIcon width={16} height={16} />
                  </span>
                  {t('whatsapp.cloudApiDesc')}
                </p>
              </>
            )}
          </fieldset>

          {missingCredentials.length > 0 && (
            <p
              role="alert"
              className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <span className="shrink-0" aria-hidden="true">
                <InfoIcon width={16} height={16} />
              </span>
              {t('whatsapp.credentialsMissing', { fields: missingCredentials.join(', ') })}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={connecting || credentialsBlocked}>
              <PlugIcon width={16} height={16} />
              {connecting ? t('whatsapp.connecting') : t('whatsapp.connect')}
            </Button>
          ) : (
            <Button variant="danger" onClick={handleDisconnect} disabled={connecting}>
              {t('whatsapp.disconnect')}
            </Button>
          )}

          <div className="ms-auto flex items-center gap-3">
            {/* Tells the user there is something to save, and offers the way out
                when the form has drifted from what is stored. */}
            {dirty && (
              <span className="flex items-center gap-3">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {t('whatsapp.unsaved')}
                </span>
                <Button variant="ghost" size="sm" onClick={discardChanges} disabled={saving}>
                  {t('common.discard')}
                </Button>
              </span>
            )}
            <Button variant="secondary" onClick={handleSave} disabled={saving || credentialsBlocked || !dirty}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── QR pairing ─────────────────────────────────────────────────── */}
      {isConnecting && (
        <Card title={t('whatsapp.pairTitle')}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-white">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt={t('whatsapp.qrAlt')}
                  width={192}
                  height={192}
                  className="h-48 w-48"
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center">
                  <Spinner label={t('whatsapp.qrLoading')} />
                </div>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('whatsapp.scanQr')}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('whatsapp.qrExpires')}</p>
          </div>
        </Card>
      )}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <BellIcon width={16} height={16} className="text-slate-400" />
            {t('whatsapp.settings.notifications')}
          </span>
        }
      >
        <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {t('whatsapp.settings.notificationsHint')}
        </p>

        <div className="space-y-5">
          <div>
            <Switch
              id="waReminder"
              checked={settings.settings.appointmentReminder}
              onChange={(next) => patchSetting('appointmentReminder', next)}
              label={t('whatsapp.settings.reminder')}
              description={t('whatsapp.settings.reminderDesc')}
            />

            {/* Indented so the timing reads as belonging to the reminder above
                rather than as a top-level setting. */}
            {settings.settings.appointmentReminder && (
              <div className="mt-4 grid gap-4 border-s border-slate-200 ps-4 sm:grid-cols-2 dark:border-slate-700">
                <Field label={t('whatsapp.settings.reminderHours')} htmlFor="waReminderHours">
                  <TextInput
                    id="waReminderHours"
                    type="number"
                    min="1"
                    max="72"
                    className="max-w-32"
                    value={settings.settings.reminderHours}
                    onChange={(e) =>
                      patchSetting('reminderHours', clamp(e.target.value, 1, 72, settings.settings.reminderHours))
                    }
                  />
                </Field>

                <Field
                  label={t('whatsapp.settings.reminderHoursSecondary')}
                  hint={t('whatsapp.settings.reminderHoursSecondaryHint')}
                  htmlFor="waReminderHoursSecondary"
                >
                  <TextInput
                    id="waReminderHoursSecondary"
                    type="number"
                    min="0"
                    max="168"
                    className="max-w-32"
                    value={settings.settings.reminderHoursSecondary}
                    onChange={(e) =>
                      patchSetting(
                        'reminderHoursSecondary',
                        clamp(e.target.value, 0, 168, settings.settings.reminderHoursSecondary),
                      )
                    }
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Switch
              id="waConfirm"
              checked={settings.settings.appointmentConfirm}
              onChange={(next) => patchSetting('appointmentConfirm', next)}
              label={t('whatsapp.settings.confirm')}
              description={t('whatsapp.settings.confirmDesc')}
            />
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Switch
              id="waInstallment"
              checked={settings.settings.installmentReminder}
              onChange={(next) => patchSetting('installmentReminder', next)}
              label={t('whatsapp.settings.installment')}
              description={t('whatsapp.settings.installmentDesc')}
            />
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Switch
              id="waNoShow"
              checked={settings.settings.noShowReminder}
              onChange={(next) => patchSetting('noShowReminder', next)}
              label={t('whatsapp.settings.noShow')}
              description={t('whatsapp.settings.noShowDesc')}
            />
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Switch
              id="waQueue"
              checked={settings.settings.queueNotifications}
              onChange={(next) => patchSetting('queueNotifications', next)}
              label={t('whatsapp.settings.queue')}
              description={t('whatsapp.settings.queueDesc')}
            />
          </div>
        </div>
      </Card>

      {/* ── Test message ───────────────────────────────────────────────── */}
      <Card title={t('whatsapp.test')}>
        {!isConnected && (
          <p className="mb-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            <span className="shrink-0" aria-hidden="true">
              <InfoIcon width={16} height={16} />
            </span>
            {t('whatsapp.testNeedsConnection')}
          </p>
        )}

        <form onSubmit={handleTestSend} className="space-y-4">
          <Field label={t('whatsapp.testPhone')} htmlFor="waTestPhone">
            <TextInput
              id="waTestPhone"
              type="tel"
              dir="ltr"
              value={testForm.to}
              onChange={(e) => setTestForm((prev) => ({ ...prev, to: e.target.value }))}
              placeholder="+201234567890"
              autoComplete="off"
              required
            />
          </Field>

          <Field label={t('whatsapp.testMessage')} htmlFor="waTestMessage">
            <Textarea
              id="waTestMessage"
              value={testForm.message}
              onChange={(e) => setTestForm((prev) => ({ ...prev, message: e.target.value }))}
              rows={3}
              maxLength={1000}
              required
            />
          </Field>

          <Button type="submit" disabled={sendingTest || !isConnected}>
            {sendingTest ? t('common.saving') : t('whatsapp.send')}
          </Button>
        </form>
      </Card>
    </div>
  );
}