import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import Modal from "../../components/ui/Modal";
import UsageQuotaBar from "../../components/ui/UsageQuotaBar";
import { PageLoader } from "../../components/ui/Spinner";
import { fetchTenantUsage } from "../analytics/analyticsSlice";
import { t } from "../../lib/i18n";

export default function UsageQuotaModal({ isOpen, onClose, tenant }) {
  const dispatch = useDispatch();
  const { tenantUsage, loading } = useSelector((state) => state.analytics);
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    if (isOpen && tenant?._id) {
      dispatch(fetchTenantUsage(tenant._id));
    }
  }, [dispatch, isOpen, tenant?._id]);

  const planLabel = tenant?.plan || "—";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${tenant?.name || ""} — ${t("usageQuotas", language)}`} size="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
          <span>{t("plan", language)}: <span className="font-medium text-slate-900 dark:text-white capitalize">{planLabel}</span></span>
        </div>

        {loading && !tenantUsage ? (
          <PageLoader />
        ) : tenantUsage ? (
          <div className="space-y-5">
            <UsageQuotaBar
              label={t("branchesLabel", language)}
              used={tenantUsage.branches?.used || 0}
              limit={tenantUsage.branches?.limit || 0}
              color="indigo"
            />
            <UsageQuotaBar
              label={t("doctorsLabel", language)}
              used={tenantUsage.doctors?.used || 0}
              limit={tenantUsage.doctors?.limit || 0}
              color="emerald"
            />
            <UsageQuotaBar
              label={t("patientsLabel", language)}
              used={tenantUsage.patients?.used || 0}
              limit={tenantUsage.patients?.limit || 0}
              color="blue"
            />
            <UsageQuotaBar
              label={t("storageLabel", language)}
              used={Math.round((tenantUsage.storage?.used || 0) / 1024)}
              limit={Math.round((tenantUsage.storage?.limit || 0) / 1024)}
              unit="GB"
              color="purple"
            />
          </div>
        ) : (
          <p className="text-slate-500 text-sm">{t("noData", language)}</p>
        )}
      </div>
    </Modal>
  );
}
