import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import PasswordInput from "../../components/ui/PasswordInput";
import {
  BuildingOfficeIcon,
  CheckCircleIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "../../components/ui/icons";
import { createTenant, updateTenant } from "./tenantsSlice";
import { t } from "../../lib/i18n";

const STATUS_OPTIONS = [
  {
    value: "trial",
    labelKey: "statusTrial",
    descKey: "trialDescription",
    color: "amber",
    icon: ClockIcon,
  },
  {
    value: "active",
    labelKey: "statusActive",
    descKey: "activeDescription",
    color: "emerald",
    icon: CheckCircleIcon,
  },
];

function ClockIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

const COLOR_MAP = {
  amber: {
    border: "border-amber-300 dark:border-amber-600",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    ring: "ring-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-500",
  },
  emerald: {
    border: "border-emerald-300 dark:border-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    ring: "ring-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-500",
  },
};

function MapPinIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  );
}

function KeyIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );
}

function ClipboardDocumentCheckIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
    </svg>
  );
}

function ChevronDownIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ChevronUpIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  );
}

export default function TenantFormModal({ isOpen, onClose, tenant }) {
  const dispatch = useDispatch();
  const { language } = useSelector((state) => state.ui);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [plans, setPlans] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [showAddress, setShowAddress] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    plan: "",
    status: "trial",
    address: "",
    city: "",
    country: "",
    adminPassword: "",
  });

  useEffect(() => {
    setCredentials(null);
    setFormErrors({});
    setShowAddress(false);
    import("../../lib/axios").then(({ default: api }) =>
      api.get("/plans").then((res) => {
        const activePlans = (Array.isArray(res.data) ? res.data : []).filter(
          (p) => p.isActive !== false,
        );
        setPlans(activePlans);
        if (!tenant && activePlans.length > 0) {
          setFormData((prev) => ({ ...prev, plan: activePlans[0].key }));
        }
      }),
    );
  }, [isOpen]);

  useEffect(() => {
    setCredentials(null);
    setFormErrors({});
    if (tenant) {
      setFormData({
        name: tenant.name || "",
        email: tenant.email || "",
        phone: tenant.phone || "",
        plan: tenant.plan || "",
        status: tenant.status || "trial",
        address: tenant.address || "",
        city: tenant.city || "",
        country: tenant.country || "",
        adminPassword: "",
      });
      if (tenant.address || tenant.city || tenant.country) {
        setShowAddress(true);
      }
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        plan: plans.length > 0 ? plans[0].key : "",
        status: "trial",
        address: "",
        city: "",
        country: "",
        adminPassword: "",
      });
      setShowAddress(false);
    }
  }, [tenant, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Clinic name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errors.email = "Invalid email address";
    if (!tenant) {
      if (!formData.adminPassword.trim())
        errors.adminPassword = "Admin password is required";
      else if (formData.adminPassword.length < 8)
        errors.adminPassword = "Must be at least 8 characters";
    }
    if (!formData.plan) errors.plan = "Please select a plan";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (tenant) {
        const { adminPassword, ...updateData } = formData;
        const result = await dispatch(
          updateTenant({ id: tenant._id, data: updateData }),
        );
        if (result.error) {
          setFormErrors({ submit: result.payload || "Failed to update tenant" });
        } else {
          onClose();
        }
      } else {
        const result = await dispatch(createTenant(formData));
        if (result.error) {
          setFormErrors({ submit: result.payload || "Failed to create tenant" });
        } else if (result.payload?.adminCredentials) {
          setCredentials(result.payload.adminCredentials);
        } else {
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  };

  const selectedPlan = plans.find((p) => p.key === formData.plan);

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors ${
      formErrors[field]
        ? "border-red-500 focus:ring-red-500"
        : "border-slate-300 dark:border-slate-600"
    }`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tenant ? t("editTenant", language) : t("addTenant", language)}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {formErrors.submit && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {formErrors.submit}
          </div>
        )}

        {/* ── Basic Info ── */}
        <SectionHeader
          icon={<BuildingOfficeIcon className="w-5 h-5" />}
          title={t("basicInformation", language)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("clinicName", language)} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={inputClass("name")}
              placeholder="e.g., Bright Dental Clinic"
            />
            <FieldError error={formErrors.name} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("email", language)} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={inputClass("email")}
              placeholder="clinic@example.com"
            />
            <FieldError error={formErrors.email} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("phone", language)}
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={inputClass("phone")}
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("plan", language)} <span className="text-red-500">*</span>
            </label>
            <select
              name="plan"
              value={formData.plan}
              onChange={handleChange}
              className={inputClass("plan")}
            >
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} — ${p.price}/{p.interval || "mo"}
                </option>
              ))}
            </select>
            <FieldError error={formErrors.plan} />
          </div>
        </div>

        {/* ── Status Cards ── */}
        <SectionHeader
          icon={<CreditCardIcon className="w-5 h-5" />}
          title={t("tenantStatusLabel", language)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = formData.status === opt.value;
            const colors = COLOR_MAP[opt.color];
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, status: opt.value }))
                }
                className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  isActive
                    ? `${colors.border} ${colors.bg} ring-2 ${colors.ring} ring-offset-2 dark:ring-offset-slate-800`
                    : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"
                }`}
              >
                <div className={`mt-0.5 ${colors.icon}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className={`block text-sm font-semibold ${
                      isActive
                        ? colors.text
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {t(opt.labelKey, language)}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t(opt.descKey, language)}
                  </span>
                </div>
                {isActive && (
                  <div className={`mt-0.5 ${colors.icon}`}>
                    <CheckCircleIcon className="w-5 h-5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Plan Details Card ── */}
        {selectedPlan && (
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              {t("planDetails", language)}
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <StatItem
                label={t("branchesLabel", language)}
                value={selectedPlan.limits?.maxBranches ?? t("unlimited", language)}
              />
              <StatItem
                label={t("doctorsLabel", language)}
                value={selectedPlan.limits?.maxDoctors ?? t("unlimited", language)}
              />
              <StatItem
                label={t("patientsLabel", language)}
                value={selectedPlan.limits?.maxPatients ?? t("unlimited", language)}
              />
              <StatItem
                label={t("storageLabel", language)}
                value={selectedPlan.limits?.storage ?? t("unlimited", language)}
              />
            </div>
          </div>
        )}

        {/* ── Address (collapsible) ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowAddress((v) => !v)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <MapPinIcon className="w-5 h-5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("locationInfo", language)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
              ({t("locationOptional", language)})
            </span>
            <div className="flex-1" />
            {showAddress ? (
              <ChevronUpIcon className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {showAddress && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-1 fade-in duration-150">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("address", language)}
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className={inputClass("address")}
                  placeholder="Street address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("city", language)}
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={inputClass("city")}
                  placeholder="City"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("country", language)}
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className={inputClass("country")}
                  placeholder="Country"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Admin Account ── */}
        {!tenant && (
          <div>
            <SectionHeader
              icon={<KeyIcon className="w-5 h-5" />}
              title={t("clinicAdminAccount", language)}
            />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              {t("clinicAdminDesc", language)}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("adminPassword", language)}{" "}
                <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                name="adminPassword"
                value={formData.adminPassword}
                onChange={handleChange}
                required
                placeholder={t("setAdminPassword", language)}
                className={inputClass("adminPassword")}
              />
              <FieldError error={formErrors.adminPassword} />
            </div>
          </div>
        )}

        {/* ── Credentials Display ── */}
        {credentials && (
          <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {t("credentialsTitle", language)}
              </h4>
            </div>
            <div className="space-y-2">
              <CredentialRow
                label={t("email", language)}
                value={credentials.email}
                onCopy={() => copyToClipboard(credentials.email)}
                copyLabel={t("copy", language)}
              />
              <CredentialRow
                label={t("credentialsPassword", language)}
                value={credentials.password}
                onCopy={() => copyToClipboard(credentials.password)}
                copyLabel={t("copy", language)}
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-600 dark:text-slate-300 w-20 shrink-0">
                  {t("credentialsLogin", language)}
                </span>
                <code className="flex-1 text-sm bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white break-all">
                  {credentials.loginUrl}
                </code>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              {t("credentialsOneTime", language)}
            </p>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
          >
            {credentials ? t("done", language) : t("cancel", language)}
          </Button>
          {!credentials && (
            <Button type="submit" loading={loading}>
              {tenant ? t("saveChanges", language) : t("addTenant", language)}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700/50">
      <span className="text-indigo-500 dark:text-indigo-400">{icon}</span>
      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h4>
    </div>
  );
}

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
      <ExclamationTriangleIcon className="w-3 h-3" />
      {error}
    </p>
  );
}

function StatItem({ label, value }) {
  return (
    <div>
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ms-2 font-medium text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function CredentialRow({ label, value, onCopy, copyLabel }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300 w-20 shrink-0">
        {label}
      </span>
      <code className="flex-1 text-sm bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors shrink-0"
      >
        {copyLabel}
      </button>
    </div>
  );
}
