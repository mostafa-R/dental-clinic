import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import { PageLoader } from "../components/ui/Spinner";
import {
  fetchAbuseChecks,
  setQuarantine,
  removeQuarantine,
} from "../features/quarantine/quarantineSlice";
import { t } from "../lib/i18n";

export default function Quarantine() {
  const dispatch = useDispatch();
  const { checks, loading } = useSelector((state) => state.quarantine);
  const { language } = useSelector((state) => state.ui);
  const [quarantineTarget, setQuarantineTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    dispatch(fetchAbuseChecks());
  }, [dispatch]);

  const handleQuarantine = async () => {
    if (!quarantineTarget) return;
    await dispatch(setQuarantine({ tenantId: quarantineTarget, reason }));
    setQuarantineTarget(null);
    setReason("");
    dispatch(fetchAbuseChecks());
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    await dispatch(removeQuarantine(removeTarget));
    setRemoveTarget(null);
    dispatch(fetchAbuseChecks());
  };

  return (
    <AppLayout>
      <Topbar title={t("abuseChecks", language)} />
      <div className="p-6">
        <div className="mb-4">
          <Button onClick={() => dispatch(fetchAbuseChecks())}>
            {t("checkAbuse", language)}
          </Button>
        </div>

        <Card>
          {loading ? (
            <PageLoader />
          ) : checks.length === 0 ? (
            <EmptyState
              title={t("noAbuseFound", language)}
              description={t("quarantineDescription", language)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("name", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("plan", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("abuseWarnings", language)}</th>
                    <th className="text-start px-4 py-3 font-medium text-slate-500">{t("actions", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.tenantId} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="info" size="sm">{c.plan}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {c.warnings.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.warnings.map((w, i) => (
                              <Badge key={i} variant="warning" size="sm">{w}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setQuarantineTarget(c.tenantId)}
                          >
                            {t("quarantineTenant", language)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600"
                            onClick={() => setRemoveTarget(c.tenantId)}
                          >
                            {t("removeQuarantine", language)}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal isOpen={!!quarantineTarget} onClose={() => setQuarantineTarget(null)}>
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("quarantineTenant", language)}</h3>
            <p className="text-sm text-slate-500">{t("quarantineConfirm", language)}</p>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("quarantineReason", language)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setQuarantineTarget(null)}>{t("cancel", language)}</Button>
              <Button variant="danger" onClick={handleQuarantine}>{t("quarantineTenant", language)}</Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={!!removeTarget} onClose={() => setRemoveTarget(null)}>
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("removeQuarantine", language)}</h3>
            <p className="text-sm text-slate-500">{t("removeQuarantineConfirm", language)}</p>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setRemoveTarget(null)}>{t("cancel", language)}</Button>
              <Button variant="success" onClick={handleRemove}>{t("removeQuarantine", language)}</Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
