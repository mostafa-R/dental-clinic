import usePhi from '../../hooks/usePhi';

/**
 * Renders its children, or a masked placeholder while a platform admin is
 * impersonating a clinic. Wrap any PHI field (phone, email, address,
 * diagnosis, etc.).
 *
 * Note this masks value fields only. Patient *name* is intentionally not
 * masked — see `middleware/phiRestrict.js` and the impersonation policy.
 */
export default function PhiField({ children, fallback = '***' }) {
  const { showPhi } = usePhi();
  if (!children && children !== 0) return null;
  return showPhi ? children : <span className="text-slate-400 italic select-all">{fallback}</span>;
}
