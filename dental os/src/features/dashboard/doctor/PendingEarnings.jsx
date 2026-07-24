import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { doctorDashboardApi } from '../doctorDashboardApi';
import StatCard from '../../../components/ui/StatCard';
import { formatMoney } from '../../../lib/format';
import { useT } from '../../../lib/i18n';

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

export default function PendingEarnings() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const perms = useSelector((s) => s.users.myPermissions);
  const [amount, setAmount] = useState(null);

  const hasAccess = perms?.isSystemAdmin || perms?.permissions?.accounting?.includes('read');

  useEffect(() => {
    if (!hasAccess || !user?._id) return;
    let cancelled = false;
    doctorDashboardApi
      .getCommissions(user._id)
      .then((data) => {
        if (cancelled) return;
        const commissions = data.commissions || [];
        const pending = commissions
          .filter((c) => c.status === 'pending')
          .reduce((sum, c) => sum + (c.amount || 0), 0);
        setAmount(pending);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasAccess, user?._id]);

  if (!hasAccess) return null;

  return (
    <StatCard
      label={t('doctorDashboard.pendingEarnings')}
      value={amount !== null ? formatMoney(amount) : '—'}
      icon={<WalletIcon />}
      hint={t('doctorDashboard.earningsHint')}
      accent="amber"
    />
  );
}
