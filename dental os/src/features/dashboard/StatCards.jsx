import StatCard from '../../components/ui/StatCard';
import { UsersIcon, StethoscopeIcon, BranchIcon } from '../../components/ui/icons';
import { formatNumber, formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';

function PatientIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
      <path d="M20 8V5a1 1 0 0 0-1-1h-3" />
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21l-4-4-1 1-2-2 1-1 2 2 3-3" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 7 15.5V7a2 2 0 0 1 2-2h9l4 4v9.5z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

export default function StatCards({ summary }) {
  const { t } = useT();
  const cards = [
    {
      label: t('dashboard.totalStaff'),
      value: formatNumber(summary.totalStaff),
      icon: <UsersIcon />,
      hint: t('dashboard.activeStaff', { count: formatNumber(summary.activeStaff) }),
      accent: 'indigo',
    },
    {
      label: t('dashboard.doctors'),
      value: formatNumber(summary.doctors),
      icon: <StethoscopeIcon />,
      hint: t('dashboard.acrossBranches'),
      accent: 'sky',
    },
    {
      label: t('dashboard.totalPatients'),
      value: formatNumber(summary.totalPatients),
      icon: <PatientIcon />,
      hint: t('dashboard.acrossBranches'),
      accent: 'emerald',
    },
    {
      label: t('dashboard.todaysAppointments'),
      value: formatNumber(summary.todaysAppointments),
      icon: <CalendarIcon />,
      hint: summary.todaysAppointments === 1 ? '1 today' : `${summary.todaysAppointments} today`,
      accent: 'violet',
    },
    {
      label: t('dashboard.todaysInvoices'),
      value: formatNumber(summary.todaysInvoices),
      icon: <InvoiceIcon />,
      hint: summary.todaysInvoices === 1 ? '1 today' : `${summary.todaysInvoices} today`,
      accent: 'amber',
    },
    {
      label: t('dashboard.outstanding'),
      value: formatMoney(summary.outstanding),
      icon: <WalletIcon />,
      hint: t('dashboard.acrossBranches'),
      accent: 'rose',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
