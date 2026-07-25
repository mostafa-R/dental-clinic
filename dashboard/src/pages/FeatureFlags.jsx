import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import { PageLoader } from "../components/ui/Spinner";
import { fetchTenants } from "../features/tenants/tenantsSlice";
import {
  fetchTenantModules,
  toggleModule,
} from "../features/featureFlags/featureFlagsSlice";
import { t } from "../lib/i18n";

const MODULE_LABELS = {
  dashboard: "Dashboard",
  patients: "Patients",
  appointments: "Appointments",
  billing: "Billing",
  accounting: "Accounting",
  emr: "EMR",
  prescriptions: "Prescriptions",
  users: "Users",
  branches: "Branches",
  inventory: "Inventory",
  roles: "Roles",
  settings: "Settings",
};

export default function FeatureFlags() {
  const dispatch = useDispatch();
  const { items: tenants, loading: tenantsLoading } = useSelector((state) => state.tenants);
  const { tenants: moduleData, toggling } = useSelector((state) => state.featureFlags);
  const { language } = useSelector((state) => state.ui);
  const [selectedTenant, setSelectedTenant] = useState("");

  useEffect(() => {
    dispatch(fetchTenants({ limit: 100 }));
  }, [dispatch]);

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTenantModules(selectedTenant));
    }
  }, [dispatch, selectedTenant]);

  const current = selectedTenant ? moduleData[selectedTenant] : null;
  const allModules = current?.availableModules || [];

  const handleToggle = (mod) => {
    if (!selectedTenant) return;
    const enabled = current.enabledModules.includes(mod);
    dispatch(toggleModule({ tenantId: selectedTenant, module: mod, enabled: !enabled }));
  };

  return (
    <div className="p-6">
      <Card className="mb-6">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {t("selectTenant", language)}
          </label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          >
            <option value="">{t("selectTenant", language)}</option>
            {tenants.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        </div>

        {tenantsLoading && <PageLoader />}

        {selectedTenant && !current && !tenantsLoading && (
          <div className="p-8 text-center text-slate-500">{t("loading", language)}</div>
        )}

        {current && (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="info">{current.plan}</Badge>
              <span className="text-sm text-slate-500">
                {current.enabledModules.length} / {allModules.length} {t("modules", language)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {allModules.map((mod) => {
                const enabled = current.enabledModules.includes(mod);
                return (
                  <label
                    key={mod}
                    className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      enabled
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className={`font-medium text-sm ${enabled ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"}`}>
                      {MODULE_LABELS[mod] || mod}
                    </span>
                    <div
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${enabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"}`}
                      onClick={() => handleToggle(mod)}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
                    </div>
                  </label>
                );
              })}
            </div>
            {toggling && (
              <p className="text-xs text-slate-400 mt-3">{t("saving", language)}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
