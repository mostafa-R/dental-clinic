import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import { PageLoader } from "../components/ui/Spinner";
import {
  clearQuarantineError,
  fetchAbuseChecks,
  removeQuarantine,
  setQuarantine,
} from "../features/quarantine/quarantineSlice";
import { t } from "../lib/i18n";
import { canUserAccess } from "../lib/permissions";

export default function Quarantine() {
  const dispatch = useDispatch();
  const { checks, loading, mutatingId, error } = useSelector((state) => state.quarantine);
  const { language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const [quarantineTarget, setQuarantineTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    dispatch(fetchAbuseChecks());
  }, [dispatch]);

  const handleQuarantine = async () => {
    if (!quarantineTarget) return;
    setActionError(null);
    dispatch(clearQuarantineError());
    try {
      await dispatch(setQuarantine({ tenantId: quarantineTarget, reason })).unwrap();
      setQuarantineTarget(null);
      setReason("");
      await dispatch(fetchAbuseChecks());
    } catch (err) {
      setActionError(typeof err === "string" ? err : t("actionFailed", language));
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setActionError(null);
    dispatch(clearQuarantineError());
    try {
      await dispatch(removeQuarantine(removeTarget)).unwrap();
      setRemoveTarget(null);
      await dispatch(fetchAbuseChecks());
    } catch (err) {
      setActionError(typeof err === "string" ? err : t("actionFailed", language));
    }
  };

  const can = (key) => canUserAccess(user, key);
  const visibleError = actionError || error;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => { setActionError(null); dispatch(clearQuarantineError()); dispatch(fetchAbuseChecks()); }}>
          {t("checkAbuse", language)}
        </Button>
      </div>

      {visibleError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
          {visibleError}
        </div>
      )}

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
                  <th scope="col" className="text-start px-4 py-3 font-medium text-slate-500">{t("name", language)}</th>
                  <th scope="col" className="text-start px-4 py-3 font-medium text-slate-500">{t("plan", language)}</th>
                  <th scope="col" className="text-start px-4 py-3 font-medium text-slate-500">{t("abuseWarnings", language)}</th>
                  <th scope="col" className="text-start px-4 py-3 font-medium text-slate-500">{t("actions", language)}</th>
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
                      {c.warnings?.length > 0 ? (
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
                        {can("quarantine.set") && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => { setActionError(null); dispatch(clearQuarantineError()); setQuarantineTarget(c.tenantId); }}
                          disabled={c.quarantined || mutatingId === c.tenantId}
                          loading={mutatingId === c.tenantId && quarantineTarget === c.tenantId}
                        >
                          {t("quarantineTenant", language)}
                        </Button>
                      )}
                      {can("quarantine.remove") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-emerald-600"
                          onClick={() => { setActionError(null); dispatch(clearQuarantineError()); setRemoveTarget(c.tenantId); }}
                          disabled={!c.quarantined || mutatingId === c.tenantId}
                          loading={mutatingId === c.tenantId && removeTarget === c.tenantId}
                        >
                          {t("removeQuarantine", language)}
                        </Button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!quarantineTarget} onClose={() => { if (mutatingId) return; setQuarantineTarget(null); }}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("quarantineTenant", language)}</h3>
          <p className="text-sm text-slate-500">{t("quarantineConfirm", language)}</p>
          {visibleError && quarantineTarget && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              {visibleError}
            </div>
          )}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("quarantineReason", language)}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setQuarantineTarget(null)} disabled={mutatingId === quarantineTarget}>{t("cancel", language)}</Button>
            <Button variant="danger" onClick={handleQuarantine} loading={mutatingId === quarantineTarget} disabled={mutatingId === quarantineTarget}>{t("quarantineTenant", language)}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!removeTarget} onClose={() => { if (mutatingId) return; setRemoveTarget(null); }}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("removeQuarantine", language)}</h3>
          <p className="text-sm text-slate-500">{t("removeQuarantineConfirm", language)}</p>
          {visibleError && removeTarget && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              {visibleError}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={mutatingId === removeTarget}>{t("cancel", language)}</Button>
            <Button variant="success" onClick={handleRemove} loading={mutatingId === removeTarget} disabled={mutatingId === removeTarget}>{t("removeQuarantine", language)}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
