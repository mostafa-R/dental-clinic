import { useSelector } from 'react-redux';

/**
 * Hook that returns whether PHI should be shown.
 * During impersonation, PHI is masked to protect patient data.
 *
 * The `PhiField` component that consumes this lives in
 * `components/ui/PhiField.jsx` — a component kept in a hooks file defeats
 * React Fast Refresh.
 */
export default function usePhi() {
  const user = useSelector((s) => s.auth.user);
  const isImpersonating = !!user?._impersonating;
  return { showPhi: !isImpersonating, isImpersonating };
}
