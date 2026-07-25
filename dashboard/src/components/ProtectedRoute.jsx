import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import { PageLoader } from "../components/ui/Spinner";

export default function ProtectedRoute() {
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return <PageLoader />;
  }

  return <Outlet />;
}
