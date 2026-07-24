import { useCallback, useEffect, useState } from 'react';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import { settingsApi } from './settingsApi';
import { useT } from '../../lib/i18n';

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div
      className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
        type === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-red-600 text-white'
      }`}
    >
      {message}
      <button onClick={onClose} className="ml-3 opacity-70 hover:opacity-100">
        &times;
      </button>
    </div>
  );
}

export default function WhatsAppSettings() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [settings, setSettings] = useState({
    enabled: false,
    provider: 'whatsapp_web',
    settings: {
      appointmentReminder: false,
      appointmentConfirm: false,
      reminderHours: 2,
    },
    status: 'disconnected',
  });
  const [qrCode, setQrCode] = useState(null);
  const [testForm, setTestForm] = useState({ to: '', message: '' });
  const [sendingTest, setSendingTest] = useState(false);

  const toast = useCallback((message, type = 'success') => {
    setMsg({ message, type });
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await settingsApi.getWhatsAppSettings();
      setSettings(data);
    } catch {
      toast(t('whatsapp.failed'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = await settingsApi.updateWhatsAppSettings(settings);
      setSettings(data);
      toast(t('whatsapp.saved'));
    } catch {
      toast(t('whatsapp.failed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setQrCode(null);
    try {
      await settingsApi.connectWhatsApp();
      const qrRes = await settingsApi.getWhatsAppQr();
      if (qrRes?.qrCode) {
        setQrCode(qrRes.qrCode);
      }
      const statusRes = await settingsApi.getWhatsAppStatus();
      setSettings((prev) => ({ ...prev, status: statusRes?.status }));
    } catch {
      toast(t('whatsapp.failed'), 'error');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await settingsApi.disconnectWhatsApp();
      setSettings((prev) => ({ ...prev, status: 'disconnected' }));
      setQrCode(null);
      toast(t('whatsapp.disconnected'));
    } catch {
      toast(t('whatsapp.failed'), 'error');
    }
  }

  async function handleTestSend(e) {
    e.preventDefault();
    if (!testForm.to || !testForm.message) return;
    setSendingTest(true);
    try {
      await settingsApi.sendTestWhatsApp(testForm);
      toast(t('whatsapp.sent'));
      setTestForm({ to: '', message: '' });
    } catch {
      toast(t('whatsapp.failed'), 'error');
    } finally {
      setSendingTest(false);
    }
  }

  useEffect(() => {
    if (settings.status === 'connected' || settings.status !== 'connecting') return;
    const interval = setInterval(async () => {
      try {
        const qrRes = await settingsApi.getWhatsAppQr();
        if (qrRes?.qrCode) {
          setQrCode(qrRes.qrCode);
        }
        const statusRes = await settingsApi.getWhatsAppStatus();
        setSettings((prev) => ({ ...prev, status: statusRes?.status }));
        if (statusRes?.status === 'connected') {
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [settings.status]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const isConnected = settings.status === 'connected';

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

  return (
    <div className="space-y-6">
      {msg && (
        <Toast message={msg.message} type={msg.type} onClose={() => setMsg(null)} />
      )}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('whatsapp.title')}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t('whatsapp.desc')}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isConnected
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : settings.status === 'connecting'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}
          >
            {isConnected
              ? t('whatsapp.connected')
              : settings.status === 'connecting'
                ? t('whatsapp.connecting')
                : t('whatsapp.disconnected')}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="whatsappEnabled"
              checked={settings.enabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="whatsappEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('whatsapp.enabled')}
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('whatsapp.provider')}
            </label>
            <select
              value={settings.provider}
              onChange={(e) => setSettings((prev) => ({ ...prev, provider: e.target.value }))}
              className={inputCls}
            >
              <option value="whatsapp_web">{t('whatsapp.provider.whatsapp_web')}</option>
              <option value="cloud_api">{t('whatsapp.provider.cloud_api')}</option>
              <option value="twilio">{t('whatsapp.provider.twilio')}</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {connecting ? '...' : t('whatsapp.connect')}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t('whatsapp.disconnect')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {saving ? '...' : t('common.save')}
          </button>
        </div>
      </Card>

      {qrCode && (
        <Card>
          <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('whatsapp.scanQr')}
          </h4>
          <p className="mb-4 text-xs text-slate-500">
            {t('whatsapp.qrExpires')}
          </p>
          <div className="flex justify-center">
            <img src={qrCode} alt="WhatsApp QR Code" className="h-48 w-48" />
          </div>
        </Card>
      )}

      <Card>
        <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
          {t('whatsapp.settings.notifications')}
        </h4>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="waReminder"
              checked={settings.settings?.appointmentReminder}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, appointmentReminder: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="waReminder" className="text-sm text-slate-700 dark:text-slate-200">
              {t('whatsapp.settings.reminder')}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="waConfirm"
              checked={settings.settings?.appointmentConfirm}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, appointmentConfirm: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="waConfirm" className="text-sm text-slate-700 dark:text-slate-200">
              {t('whatsapp.settings.confirm')}
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('whatsapp.settings.reminderHours')}
            </label>
            <input
              type="number"
              min="1"
              max="72"
              value={settings.settings?.reminderHours || 2}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, reminderHours: parseInt(e.target.value) || 2 },
                }))
              }
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
          {t('whatsapp.test')}
        </h4>
        <form onSubmit={handleTestSend} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('whatsapp.testPhone')}
            </label>
            <input
              type="text"
              value={testForm.to}
              onChange={(e) => setTestForm((prev) => ({ ...prev, to: e.target.value }))}
              placeholder="+201234567890"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('whatsapp.testMessage')}
            </label>
            <textarea
              value={testForm.message}
              onChange={(e) => setTestForm((prev) => ({ ...prev, message: e.target.value }))}
              rows={3}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={sendingTest || !isConnected}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {sendingTest ? '...' : t('whatsapp.send')}
          </button>
        </form>
      </Card>
    </div>
  );
}
