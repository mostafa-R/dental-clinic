import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { canUserAccess } from "../lib/permissions";

export default function RequireAccess({ accessKey, children }) {
  const { user } = useSelector((state) => state.auth);

  if (!canUserAccess(user, accessKey)) {
    return <Navigate to="/" replace />;
  }

  return children;
}