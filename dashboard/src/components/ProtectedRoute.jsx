import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import { endImpersonation } from "../features/impersonation/impersonationSlice";
import { PageLoader } from "../components/ui/Spinner";
import { t } from "../lib/i18n";

function ImpersonationBanner() {
  const dispatch = useDispatch();
  const { active, targetUser, targetTenant } = useSelector((state) => state.impersonation);
  const { language } = useSelector((state) => state.ui);

  if (!active) return null;

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>
        <strong>{t("impersonationWarning", language)}:</strong>{" "}
        {targetUser?.name} ({targetUser?.email}) @ {targetTenant?.name}
        <span className="ml-2 text-red-200 text-xs">{t("impersonationDesc", language)}</span>
      </span>
      <button
        onClick={() => dispatch(endImpersonation())}
        className="bg-white text-red-600 px-3 py-1 rounded text-xs font-medium hover:bg-red-50"
      >
        {t("stopImpersonation", language)}
      </button>
    </div>
  );
}

export default function ProtectedRoute() {
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return <PageLoader />;
  }

  return (
    <>
      <ImpersonationBanner />
      <Outlet />
    </>
  );
}
