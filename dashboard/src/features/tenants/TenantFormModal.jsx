import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import PasswordInput from "../../components/ui/PasswordInput";
import { createTenant, updateTenant } from "./tenantsSlice";
import { t } from "../../lib/i18n";

export default function TenantFormModal({ isOpen, onClose, tenant }) {
  const dispatch = useDispatch();
  const { language } = useSelector((state) => state.ui);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [plans, setPlans] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    plan: "",
    address: "",
    city: "",
    country: "",
    adminPassword: "",
  });

  useEffect(() => {
    setCredentials(null);
    // Fetch available plans from the Plan model
    import("../../lib/axios").then(({ default: api }) =>
      api.get("/plans").then((res) => {
        const activePlans = (res.data || []).filter((p) => p.isActive !== false);
        setPlans(activePlans);
        if (!tenant && activePlans.length > 0) {
          setFormData((prev) => ({ ...prev, plan: activePlans[0].key }));
        }
      }),
    );
  }, [isOpen]);

  useEffect(() => {
    setCredentials(null);
    if (tenant) {
      setFormData({
        name: tenant.name || "",
        email: tenant.email || "",
        phone: tenant.phone || "",
        plan: tenant.plan || "",
        address: tenant.address || "",
        city: tenant.city || "",
        country: tenant.country || "",
        adminPassword: "",
      });
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        plan: plans.length > 0 ? plans[0].key : "",
        address: "",
        city: "",
        country: "",
        adminPassword: "",
      });
    }
  }, [tenant, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tenant && !formData.adminPassword.trim()) {
      alert('Admin password is required');
      return;
    }
    if (!tenant && formData.adminPassword.trim().length < 8) {
      alert('Admin password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      if (tenant) {
        const result = await dispatch(updateTenant({ id: tenant._id, data: formData }));
        if (result.error) {
          alert(result.payload || 'Failed to update tenant');
        } else {
          onClose();
        }
      } else {
        const result = await dispatch(createTenant(formData));
        if (result.error) {
          alert(result.payload || 'Failed to create tenant');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tenant ? t("editTenant", language) : t("addTenant", language)}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {t("basicInformation", language)}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("clinicName", language)} *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("email", language)} *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
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
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("plan", language)} *
              </label>
              <select
                name="plan"
                value={formData.plan}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} - ${p.price}/{p.interval || "mo"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedPlan && (
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("planLimits", language)}
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("branchesLabel", language)}</span>
                <span className="ms-2 font-medium text-slate-900 dark:text-white">
                  {selectedPlan.limits?.maxBranches ?? t("unlimited", language)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("doctorsLabel", language)}</span>
                <span className="ms-2 font-medium text-slate-900 dark:text-white">
                  {selectedPlan.limits?.maxDoctors ?? t("unlimited", language)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("patientsLabel", language)}</span>
                <span className="ms-2 font-medium text-slate-900 dark:text-white">
                  {selectedPlan.limits?.maxPatients ?? t("unlimited", language)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("storageLabel", language)}</span>
                <span className="ms-2 font-medium text-slate-900 dark:text-white">
                  {selectedPlan.limits?.storage ?? t("unlimited", language)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {t("address", language)}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("address", language)}
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>

        {!tenant && (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              {t("clinicAdminAccount", language)}
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              {t("clinicAdminDesc", language)}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("adminPassword", language)} *
              </label>
              <PasswordInput
                name="adminPassword"
                value={formData.adminPassword}
                onChange={handleChange}
                required
                placeholder={t("setAdminPassword", language)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        )}

        {credentials && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3">
              {t("credentialsTitle", language)}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 w-20">{t("email", language)}:</span>
                <code className="flex-1 text-sm bg-white dark:bg-slate-800 px-2 py-1 rounded font-mono text-slate-900 dark:text-white">
                  {credentials.email}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(credentials.email)}
                  className="text-xs px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200"
                >
                  {t("copy", language)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 w-20">{t("credentialsPassword", language)}</span>
                <code className="flex-1 text-sm bg-white dark:bg-slate-800 px-2 py-1 rounded font-mono text-slate-900 dark:text-white">
                  {credentials.password}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(credentials.password)}
                  className="text-xs px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200"
                >
                  {t("copy", language)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 w-20">{t("credentialsLogin", language)}</span>
                <code className="flex-1 text-sm bg-white dark:bg-slate-800 px-2 py-1 rounded font-mono text-slate-900 dark:text-white">
                  {credentials.loginUrl}
                </code>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              {t("credentialsOneTime", language)}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button variant="secondary" type="button" onClick={onClose}>
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