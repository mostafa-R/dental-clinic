import { useSelector } from 'react-redux';

/**
 * Hook that returns whether PHI should be shown.
 * During impersonation, PHI is masked to protect patient data.
 */
export function usePhi() {
  const user = useSelector((s) => s.auth.user);
  const isImpersonating = !!user?._impersonating;
  return { showPhi: !isImpersonating, isImpersonating };
}

/**
 * Component that conditionally renders its children or a masked placeholder.
 * Use around any PHI field (phone, email, address, diagnosis, etc.).
 */
export function PhiField({ children, fallback = '***' }) {
  const { showPhi } = usePhi();
  if (!children && children !== 0) return null;
  return showPhi ? children : <span className="text-slate-400 italic select-all">{fallback}</span>;
}