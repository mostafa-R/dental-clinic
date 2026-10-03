import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
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
import { fetchPlans } from "../features/plans/plansSlice";
import { setLanguage, setTheme } from "../features/ui/uiSlice";
import { MoonIcon, SunIcon } from "../components/ui/icons";
import PageHeader from "../components/ui/PageHeader";
import { t } from "../lib/i18n";
import { canUserAccess } from "../lib/permissions";

const listToText = (value) => (Array.isArray(value) ? value.join("\n") : "");

// The API takes arrays; the textarea uses one entry per line.
const textToList = (value) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const toNumber = (value, fallback) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function Settings() {
  const dispatch = useDispatch();
  const { theme, language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const { settings, loading, error: platformError } = useSelector(
    (state) => state.platform,
  );
  const { items: plans } = useSelector((state) => state.plans);
  const isSuperAdmin = user?.role === "super_admin";
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const twofa = useSelector((state) => state.twofa);
  const [platformFormData, setPlatformFormData] = useState({
    siteName: "",
    supportEmail: "",
    autoSuspendDays: 30,
    emailNotifications: true,
    maintenanceMode: false,
    trialDays: 14,
    defaultPlan: "",
    allowedDomains: "",
    allowedSiteIps: "",
    maxTenants: 100,
    backupEnabled: false,
    backupRetentionDays: 30,
    backupTime: "02:00",
  });

  const setPlatformField = (key, value) =>
    setPlatformFormData((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    dispatch(fetchPlatformSettings());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchPlans());
  }, [dispatch]);

  useEffect(() => {
    dispatch(get2faStatus());
  }, [dispatch]);

  useEffect(() => {
    if (settings) {
      // `??` rather than `||`: autoSuspendDays of 0 means "never auto-suspend"
      // and was being rewritten to 30.
      setPlatformFormData({
        siteName: settings.siteName || "",
        supportEmail: settings.supportEmail || "",
        autoSuspendDays: settings.autoSuspendDays ?? 30,
        emailNotifications: settings.emailNotifications ?? true,
        maintenanceMode: settings.maintenanceMode ?? false,
        trialDays: settings.trialDays ?? 14,
        defaultPlan: settings.defaultPlan || "",
        allowedDomains: listToText(settings.allowedDomains),
        allowedSiteIps: listToText(settings.allowedSiteIps),
        maxTenants: settings.maxTenants ?? 100,
        backupEnabled: settings.backupEnabled ?? false,
        backupRetentionDays: settings.backupRetentionDays ?? 30,
        backupTime: settings.backupTime || "02:00",
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
    const result = await dispatch(verify2fa(tokenInput));
    if (!result.error) {
      setTokenInput("");
    }
  };

  const handleDisable2fa = async () => {
    const result = await dispatch(disable2fa(tokenInput));
    if (!result.error) {
      setShowDisableModal(false);
      setTokenInput("");
    }
  };

  const handlePlatformSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const result = await dispatch(
        updatePlatformSettings({
          siteName: platformFormData.siteName.trim(),
          supportEmail: platformFormData.supportEmail.trim(),
          autoSuspendDays: toNumber(platformFormData.autoSuspendDays, 30),
          emailNotifications: platformFormData.emailNotifications,
          maintenanceMode: platformFormData.maintenanceMode,
          trialDays: toNumber(platformFormData.trialDays, 14),
          defaultPlan: platformFormData.defaultPlan,
          allowedDomains: textToList(platformFormData.allowedDomains),
          allowedSiteIps: textToList(platformFormData.allowedSiteIps),
          maxTenants: toNumber(platformFormData.maxTenants, 100),
          backupEnabled: platformFormData.backupEnabled,
          backupRetentionDays: toNumber(platformFormData.backupRetentionDays, 30),
          backupTime: platformFormData.backupTime,
        }),
      );
      // PUT /platform is gated behind a fresh 2FA check, so a rejected token
      // is the most likely failure — surface it instead of saving silently.
      if (updatePlatformSettings.rejected.match) {
        setSaveError(result.error);
      } else {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return <PageLoader />;
  }

  const canEditPlatform = canUserAccess(user, "settings.update");
  const numberInputClass =
    "w-24 px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center";
  const textInputClass =
    "w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none";
  const settingRowClass =
    "flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg";
  const settingLabelClass = "font-medium text-slate-900 dark:text-white";
  const settingDescClass = "text-sm text-slate-500 dark:text-slate-400";

  const toggleSwitch = (checked, onChange, tone = "indigo") => {
    const focusRing = tone === "red" ? "peer-focus:ring-red-300 dark:peer-focus:ring-red-800" : "peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800";
    const checkedBg = tone === "red" ? "peer-checked:bg-red-600" : "peer-checked:bg-indigo-600";
    return (
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={onChange}
        />
        <div
          className={`w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 ${focusRing} rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 ${checkedBg}`}
        />
      </label>
    );
  };

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title={t("settings", language)} />

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
            {twofa.enabled && isSuperAdmin && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t("superAdmin2faRequired", language)}
              </p>
            )}
            {!twofa.enabled && isSuperAdmin && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {t("superAdmin2faLocked", language)}
              </p>
            )}
          </div>
          {twofa.enabled && !isSuperAdmin ? (
            <Button variant="danger" onClick={() => setShowDisableModal(true)}>
              {t("disable2fa", language)}
            </Button>
          ) : twofa.enabled ? (
            <Button variant="danger" disabled>
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
              {/*
                Rendered by our own server from the otpauth URI. This used to be
                an <img> pointing at api.qrserver.com, which sent the TOTP
                secret — enough to generate valid codes for a super-admin
                account — to a third party, along with the admin's email.
              */}
              {twofa.setupData.qrCodeDataUrl ? (
                <img
                  src={twofa.setupData.qrCodeDataUrl}
                  alt="QR Code"
                  className="rounded-lg border border-slate-200"
                />
              ) : twofa.setupData.otpauth ? (
                <p className="max-w-sm text-center text-xs text-slate-500">
                  {t("scanQrCode", language)}
                </p>
              ) : null}
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
                <span className="text-2xl mb-2 block text-amber-500">
                  <SunIcon className="w-7 h-7 mx-auto" />
                </span>
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
                <span className="text-2xl mb-2 block text-indigo-400">
                  <MoonIcon className="w-7 h-7 mx-auto" />
                </span>
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
              <option value="ar">&#1575;&#1604;&#1593;&#1585;&#1576;&#1610;&#1577; (Arabic)</option>
            </select>
          </div>
        </div>
      </Card>

<Card className="mb-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("platformSettings", language)}
          </h3>
          {canEditPlatform && (
            <Button onClick={handlePlatformSave} loading={saving}>
              {t("save", language)}
            </Button>
          )}
        </div>

        {!canEditPlatform && (
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {t("superAdmin2faRequired", language)}
          </p>
        )}

        {(saveError || platformError) && (
          <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
            {saveError || platformError}
          </p>
        )}
        {saved && (
          <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
            {t("platformSaved", language)}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className={settingLabelClass} htmlFor="platform-site-name">
              {t("siteName", language)}
            </label>
            <p className={`${settingDescClass} mb-2`}>{t("siteNameDesc", language)}</p>
            <input
              id="platform-site-name"
              type="text"
              value={platformFormData.siteName}
              onChange={(e) => setPlatformField("siteName", e.target.value)}
              className={textInputClass}
            />
          </div>

          <div>
            <label className={settingLabelClass} htmlFor="platform-support-email">
              {t("supportEmail", language)}
            </label>
            <p className={`${settingDescClass} mb-2`}>{t("supportEmailDesc", language)}</p>
            <input
              id="platform-support-email"
              type="email"
              value={platformFormData.supportEmail}
              onChange={(e) => setPlatformField("supportEmail", e.target.value)}
              className={textInputClass}
            />
          </div>

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("autoSuspendTenants", language)}</p>
              <p className={settingDescClass}>{t("autoSuspendDesc", language)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min="0"
                value={platformFormData.autoSuspendDays}
                onChange={(e) => setPlatformField("autoSuspendDays", e.target.value)}
                className={numberInputClass}
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {t("days", language)}
              </span>
            </div>
          </div>

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("trialPeriod", language)}</p>
              <p className={settingDescClass}>{t("trialPeriodDesc", language)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min="0"
                value={platformFormData.trialDays}
                onChange={(e) => setPlatformField("trialDays", e.target.value)}
                className={numberInputClass}
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {t("days", language)}
              </span>
            </div>
          </div>

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("defaultPlan", language)}</p>
              <p className={settingDescClass}>{t("defaultPlanDesc", language)}</p>
            </div>
            <select
              value={platformFormData.defaultPlan}
              onChange={(e) => setPlatformField("defaultPlan", e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white shrink-0"
            >
              {/* An empty option keeps the select valid when the stored plan
                  key no longer exists in the plans list. */}
              <option value="">{t("noDefaultPlan", language)}</option>
              {plans.map((plan) => (
                <option key={plan._id} value={plan.key}>
                  {plan.name}
                </option>
              ))}
              {!plans.some((plan) => plan.key === platformFormData.defaultPlan) &&
                platformFormData.defaultPlan && (
                  <option value={platformFormData.defaultPlan}>
                    {platformFormData.defaultPlan}
                  </option>
                )}
            </select>
          </div>

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("maxTenants", language)}</p>
              <p className={settingDescClass}>{t("maxTenantsDesc", language)}</p>
            </div>
            <input
              type="number"
              min="1"
              value={platformFormData.maxTenants}
              onChange={(e) => setPlatformField("maxTenants", e.target.value)}
              className={numberInputClass}
            />
          </div>

          <div>
            <label className={settingLabelClass} htmlFor="platform-allowed-domains">
              {t("allowedDomains", language)}
            </label>
            <p className={`${settingDescClass} mb-2`}>{t("allowedDomainsDesc", language)}</p>
            <textarea
              id="platform-allowed-domains"
              rows={3}
              value={platformFormData.allowedDomains}
              onChange={(e) => setPlatformField("allowedDomains", e.target.value)}
              placeholder={t("allowedDomainsPlaceholder", language)}
              className={textInputClass}
            />
          </div>

          <div>
            <label className={settingLabelClass} htmlFor="platform-allowed-ips">
              {t("allowedSiteIps", language)}
            </label>
            <p className={`${settingDescClass} mb-2`}>{t("allowedSiteIpsDesc", language)}</p>
            <textarea
              id="platform-allowed-ips"
              rows={3}
              value={platformFormData.allowedSiteIps}
              onChange={(e) => setPlatformField("allowedSiteIps", e.target.value)}
              placeholder={t("allowedSiteIpsPlaceholder", language)}
              className={textInputClass}
            />
          </div>

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("backupEnabled", language)}</p>
              <p className={settingDescClass}>{t("backupEnabledDesc", language)}</p>
            </div>
            {toggleSwitch(
              platformFormData.backupEnabled,
              (e) => setPlatformField("backupEnabled", e.target.checked),
            )}
          </div>

          {platformFormData.backupEnabled && (
            <>
              <div className={settingRowClass}>
                <div>
                  <p className={settingLabelClass}>{t("backupRetentionDays", language)}</p>
                  <p className={settingDescClass}>
                    {t("backupRetentionDaysDesc", language)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="1"
                    value={platformFormData.backupRetentionDays}
                    onChange={(e) => setPlatformField("backupRetentionDays", e.target.value)}
                    className={numberInputClass}
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {t("days", language)}
                  </span>
                </div>
              </div>

              <div className={settingRowClass}>
                <div>
                  <p className={settingLabelClass}>{t("backupTime", language)}</p>
                  <p className={settingDescClass}>{t("backupTimeDesc", language)}</p>
                </div>
                <input
                  type="time"
                  value={platformFormData.backupTime}
                  onChange={(e) => setPlatformField("backupTime", e.target.value)}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white shrink-0"
                />
              </div>
            </>
          )}

          <div className={settingRowClass}>
            <div>
              <p className={settingLabelClass}>{t("emailNotifications", language)}</p>
              <p className={settingDescClass}>{t("emailNotificationsDesc", language)}</p>
            </div>
            {toggleSwitch(
              platformFormData.emailNotifications,
              (e) => setPlatformField("emailNotifications", e.target.checked),
            )}
          </div>

          <div className="flex items-center justify-between gap-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div>
              <p className="font-medium text-red-900 dark:text-red-200">
                {t("maintenanceMode", language)}
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {t("maintenanceModeDesc", language)}
              </p>
            </div>
            {toggleSwitch(
              platformFormData.maintenanceMode,
              (e) => setPlatformField("maintenanceMode", e.target.checked),
              "red",
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
