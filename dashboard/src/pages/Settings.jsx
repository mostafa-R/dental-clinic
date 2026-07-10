import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { PageLoader } from "../components/ui/Spinner";
import Modal from "../components/ui/Modal";
import {
  fetchPlatformSettings,
  updatePlatformSettings,
} from "../features/platform/platformSlice";
import {
  get2faStatus,
  setup2fa,
  verify2fa,
  disable2fa,
  clearSetupData,
} from "../features/twofa/twofaSlice";
import { setLanguage, setTheme } from "../features/ui/uiSlice";
import { t } from "../lib/i18n";

export default function Settings() {
  const dispatch = useDispatch();
  const { theme, language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const { settings, loading } = useSelector((state) => state.platform);
  const [saving, setSaving] = useState(false);
  const [show2faModal, setShow2faModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const twofa = useSelector((state) => state.twofa);
  const [platformFormData, setPlatformFormData] = useState({
    autoSuspendDays: 30,
    emailNotifications: true,
    maintenanceMode: false,
    trialDays: 14,
    defaultPlan: "starter",
  });

  useEffect(() => {
    dispatch(fetchPlatformSettings());
  }, [dispatch]);

  useEffect(() => {
    dispatch(get2faStatus());
  }, [dispatch]);

  useEffect(() => {
    if (settings) {
      setPlatformFormData({
        autoSuspendDays: settings.autoSuspendDays || 30,
        emailNotifications: settings.emailNotifications ?? true,
        maintenanceMode: settings.maintenanceMode ?? false,
        trialDays: settings.trialDays || 14,
        defaultPlan: settings.defaultPlan || "starter",
      });
    }
  }, [settings]);

  const handleThemeChange = (newTheme) => {
    dispatch(setTheme(newTheme));
  };

  const handleLanguageChange = (newLanguage) => {
    dispatch(setLanguage(newLanguage));
  };

  const handleSetup2fa = async () => {
    await dispatch(setup2fa());
    setTokenInput("");
  };

  const handleVerify2fa = async () => {
    await dispatch(verify2fa(tokenInput));
    if (!twofa.error) {
      setShow2faModal(false);
      setTokenInput("");
    }
  };

  const handleDisable2fa = async () => {
    await dispatch(disable2fa(tokenInput));
    if (!twofa.error) {
      setShowDisableModal(false);
      setTokenInput("");
    }
  };

  const handlePlatformSave = async () => {
    setSaving(true);
    try {
      await dispatch(updatePlatformSettings(platformFormData));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <AppLayout>
        <Topbar title={t("settings", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("settings", language)} />
      <div className="p-6 max-w-4xl">
        {/* Profile Section */}
        <Card className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("profile", language)}
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {user?.name?.charAt(0) || "A"}
              </span>
            </div>
            <div>
              <h4 className="text-xl font-semibold text-slate-900 dark:text-white">
                {user?.name || "Admin"}
              </h4>
              <p className="text-slate-500 dark:text-slate-400">
                {user?.email}
              </p>
                <p className="text-sm text-indigo-600 dark:text-indigo-400 capitalize">
                  {user?.role?.replace("_", " ") || t("superAdmin", language)}
              </p>
            </div>
          </div>
        </Card>

        {/* Two-Factor Authentication */}
        <Card className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("twoFactor", language)}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t("twoFactorDesc", language)}
          </p>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {twofa.enabled ? t("twoFactorEnabled", language) : t("twoFactorDisabled", language)}
              </p>
            </div>
            {twofa.enabled ? (
              <Button variant="danger" onClick={() => setShowDisableModal(true)}>
                {t("disable2fa", language)}
              </Button>
            ) : (
              <Button onClick={handleSetup2fa} loading={twofa.loading}>
                {t("enable2fa", language)}
              </Button>
            )}
          </div>
        </Card>

        {twofa.setupData && (
          <Modal isOpen={true} onClose={() => dispatch(clearSetupData())}>
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("enable2fa", language)}
              </h3>
              <p className="text-sm text-slate-500">{t("scanQrCode", language)}</p>
              <div className="flex justify-center">
                {twofa.setupData.otpauth && (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twofa.setupData.otpauth)}`}
                    alt="QR Code"
                    className="rounded-lg border border-slate-200"
                  />
                )}
              </div>
              <p className="text-xs text-slate-400 text-center font-mono break-all">
                {twofa.setupData.secret}
              </p>
              {twofa.setupData.backupCodes?.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="font-medium text-amber-900 dark:text-amber-200 mb-2">
                    {t("backupCodes", language)}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                    {t("backupCodesDesc", language)}
                  </p>
                  <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                    {twofa.setupData.backupCodes.map((code) => (
                      <code key={code} className="text-amber-900 dark:text-amber-200">{code}</code>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm text-slate-500">{t("enterToken", language)}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("tokenPlaceholder", language)}
                  className="w-full px-4 py-2 text-lg text-center tracking-widest border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              {twofa.error && (
                <p className="text-sm text-red-500">{twofa.error}</p>
              )}
              <Button onClick={handleVerify2fa} loading={twofa.verifying} className="w-full">
                {t("verifyToken", language)}
              </Button>
            </div>
          </Modal>
        )}

        <Modal isOpen={showDisableModal} onClose={() => { setShowDisableModal(false); setTokenInput(""); }}>
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("disable2fa", language)}
            </h3>
            <p className="text-sm text-slate-500">{t("enterToken", language)}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("tokenPlaceholder", language)}
              className="w-full px-4 py-2 text-lg text-center tracking-widest border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {twofa.error && <p className="text-sm text-red-500">{twofa.error}</p>}
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => { setShowDisableModal(false); setTokenInput(""); }}>
                {t("cancel", language)}
              </Button>
              <Button variant="danger" onClick={handleDisable2fa} loading={twofa.disabling}>
                {t("disable2fa", language)}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Appearance */}
        <Card className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t("appearance", language)}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("theme", language)}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => handleThemeChange("light")}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    theme === "light"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <span className="text-2xl mb-2 block">☀️</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("lightTheme", language)}
                  </span>
                </button>
                <button
                  onClick={() => handleThemeChange("dark")}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    theme === "dark"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <span className="text-2xl mb-2 block">🌙</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("darkTheme", language)}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("language", language)}
              </label>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Platform Settings */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("platformSettings", language)}
            </h3>
            <Button onClick={handlePlatformSave} loading={saving}>
              {t("save", language)}
            </Button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {t("autoSuspendTenants", language)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("autoSuspendDesc", language)}
                </p>
              </div>
              <input
                type="number"
                value={platformFormData.autoSuspendDays}
                onChange={(e) =>
                  setPlatformFormData({
                    ...platformFormData,
                    autoSuspendDays: parseInt(e.target.value) || 30,
                  })
                }
                className="w-20 px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {t("days", language)}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {t("trialPeriod", language)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("trialPeriodDesc", language)}
                </p>
              </div>
              <input
                type="number"
                value={platformFormData.trialDays}
                onChange={(e) =>
                  setPlatformFormData({
                    ...platformFormData,
                    trialDays: parseInt(e.target.value) || 14,
                  })
                }
                className="w-20 px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {t("days", language)}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {t("defaultPlan", language)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("defaultPlanDesc", language)}
                </p>
              </div>
              <select
                value={platformFormData.defaultPlan}
                onChange={(e) =>
                  setPlatformFormData({
                    ...platformFormData,
                    defaultPlan: e.target.value,
                  })
                }
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {t("emailNotifications", language)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("emailNotificationsDesc", language)}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={platformFormData.emailNotifications}
                  onChange={(e) =>
                    setPlatformFormData({
                      ...platformFormData,
                      emailNotifications: e.target.checked,
                    })
                  }
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div>
                  <p className="font-medium text-red-900 dark:text-red-200">
                    {t("maintenanceMode", language)}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {t("maintenanceModeDesc", language)}
                  </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={platformFormData.maintenanceMode}
                  onChange={(e) =>
                    setPlatformFormData({
                      ...platformFormData,
                      maintenanceMode: e.target.checked,
                    })
                  }
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 peer-checked:bg-red-600"></div>
              </label>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
