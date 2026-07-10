import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Spinner from "../../components/ui/Spinner";
import api from "../../lib/axios";
import { t } from "../../lib/i18n";

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
        type === "success"
          ? "bg-emerald-600 text-white"
          : "bg-red-600 text-white"
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
  const { language } = useSelector((state) => state.ui);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [settings, setSettings] = useState({
    enabled: false,
    provider: "whatsapp_web",
    settings: {
      appointmentReminder: false,
      appointmentConfirm: false,
      reminderHours: 2,
    },
    status: "disconnected",
  });
  const [qrCode, setQrCode] = useState(null);
  const [testForm, setTestForm] = useState({ to: "", message: "" });
  const [sendingTest, setSendingTest] = useState(false);

  const toast = useCallback((message, type = "success") => {
    setMsg({ message, type });
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp/settings");
      setSettings(data.data);
    } catch {
      toast(t("whatsapp.failed", language), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data } = await api.put("/whatsapp/settings", settings);
      setSettings(data.data);
      toast(t("whatsapp.saved", language));
    } catch {
      toast(t("whatsapp.failed", language), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setQrCode(null);
    try {
      await api.post("/whatsapp/connect");
      const qrRes = await api.get("/whatsapp/qr");
      if (qrRes.data.data?.qrCode) {
        setQrCode(qrRes.data.data.qrCode);
      }
      const statusRes = await api.get("/whatsapp/status");
      setSettings((prev) => ({ ...prev, status: statusRes.data.data.status }));
    } catch {
      toast(t("whatsapp.failed", language), "error");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await api.post("/whatsapp/disconnect");
      setSettings((prev) => ({ ...prev, status: "disconnected" }));
      setQrCode(null);
      toast(t("whatsapp.disconnected", language));
    } catch {
      toast(t("whatsapp.failed", language), "error");
    }
  }

  async function handleTestSend(e) {
    e.preventDefault();
    if (!testForm.to || !testForm.message) return;
    setSendingTest(true);
    try {
      await api.post("/whatsapp/test", testForm);
      toast(t("whatsapp.sent", language));
      setTestForm({ to: "", message: "" });
    } catch {
      toast(t("whatsapp.failed", language), "error");
    } finally {
      setSendingTest(false);
    }
  }

  useEffect(() => {
    if (settings.status === "connected" || settings.status !== "connecting")
      return;
    const interval = setInterval(async () => {
      try {
        const qrRes = await api.get("/whatsapp/qr");
        if (qrRes.data.data?.qrCode) {
          setQrCode(qrRes.data.data.qrCode);
        }
        const statusRes = await api.get("/whatsapp/status");
        setSettings((prev) => ({
          ...prev,
          status: statusRes.data.data.status,
        }));
        if (statusRes.data.data.status === "connected") {
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [settings.status]);

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );

  const isConnected = settings.status === "connected";

  return (
    <div className="space-y-6">
      {msg && (
        <Toast
          message={msg.message}
          type={msg.type}
          onClose={() => setMsg(null)}
        />
      )}

      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        Underwork
      </div>

      {/* <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("whatsapp.title", language)}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("whatsapp.desc", language)}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              isConnected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : settings.status === "connecting"
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {isConnected
              ? t("whatsapp.connected", language)
              : settings.status === "connecting"
                ? t("whatsapp.connecting", language)
                : t("whatsapp.disconnected", language)}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="whatsappEnabled"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, enabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="whatsappEnabled"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              {t("whatsapp.enabled", language)}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("whatsapp.provider", language)}
            </label>
            <select
              value={settings.provider}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, provider: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="whatsapp_web">
                {t("whatsapp.provider.whatsapp_web", language)}
              </option>
              <option value="cloud_api">
                {t("whatsapp.provider.cloud_api", language)}
              </option>
              <option value="twilio">
                {t("whatsapp.provider.twilio", language)}
              </option>
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
              {connecting ? "..." : t("whatsapp.connect", language)}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("whatsapp.disconnect", language)}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "..." : t("common.save", language)}
          </button>
        </div>
      </Card>

      {qrCode && (
        <Card>
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {t("whatsapp.scanQr", language)}
          </h4>
          <p className="text-xs text-slate-500 mb-4">
            {t("whatsapp.qrExpires", language)}
          </p>
          <div className="flex justify-center">
            <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
          </div>
        </Card>
      )}

      <Card>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
          {t("whatsapp.settings.notifications", language)}
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
                  settings: {
                    ...prev.settings,
                    appointmentReminder: e.target.checked,
                  },
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="waReminder"
              className="text-sm text-slate-700 dark:text-slate-200"
            >
              {t("whatsapp.settings.reminder", language)}
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
                  settings: {
                    ...prev.settings,
                    appointmentConfirm: e.target.checked,
                  },
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="waConfirm"
              className="text-sm text-slate-700 dark:text-slate-200"
            >
              {t("whatsapp.settings.confirm", language)}
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("whatsapp.settings.reminderHours", language)}
            </label>
            <input
              type="number"
              min="1"
              max="72"
              value={settings.settings?.reminderHours || 2}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    reminderHours: parseInt(e.target.value) || 2,
                  },
                }))
              }
              className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
          {t("whatsapp.test", language)}
        </h4>
        <form onSubmit={handleTestSend} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("whatsapp.testPhone", language)}
            </label>
            <input
              type="text"
              value={testForm.to}
              onChange={(e) =>
                setTestForm((prev) => ({ ...prev, to: e.target.value }))
              }
              placeholder="+201234567890"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("whatsapp.testMessage", language)}
            </label>
            <textarea
              value={testForm.message}
              onChange={(e) =>
                setTestForm((prev) => ({ ...prev, message: e.target.value }))
              }
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={sendingTest || !isConnected}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {sendingTest ? "..." : t("whatsapp.send", language)}
          </button>
        </form>
      </Card> */}
    </div>
  );
}
