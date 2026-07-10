import StatCard from '../../components/ui/StatCard';
import { formatMoney, formatNumber } from '../../lib/format';
import { useT } from '../../lib/i18n';

function CashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}

export default function BillingSummary({ summary }) {
  const { t } = useT();
  if (!summary) return null;

  const collectionRate = summary.totalBilled > 0
    ? Math.round((summary.totalPaid / summary.totalBilled) * 100)
    : 0;

  const cards = [
    {
      label: t('billing.summary.totalBilled'),
      value: formatMoney(summary.totalBilled),
      icon: <CashIcon />,
      hint: t('billing.summary.count', { count: formatNumber(summary.count) }),
      accent: 'indigo',
    },
    {
      label: t('billing.summary.totalPaid'),
      value: formatMoney(summary.totalPaid),
      icon: <CheckIcon />,
      hint: t('billing.summary.collected'),
      accent: 'emerald',
    },
    {
      label: t('billing.summary.outstanding'),
      value: formatMoney(summary.outstanding),
      icon: <AlertIcon />,
      hint: t('billing.summary.unpaidBalance'),
      accent: 'amber',
    },
    {
      label: t('billing.summary.collectionRate'),
      value: `${collectionRate}%`,
      icon: <DocIcon />,
      hint: t('billing.summary.invoices', { count: formatNumber(summary.count) }),
      accent: 'sky',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
