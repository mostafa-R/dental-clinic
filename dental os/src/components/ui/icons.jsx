const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function UsersIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function BranchIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  );
}

export function StethoscopeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 3v6a4 4 0 0 0 8 0V3" />
      <path d="M4 3h2M10 3h2" />
      <path d="M8 13v3a5 5 0 0 0 10 0v-2" />
      <circle cx="18" cy="11" r="2" />
    </svg>
  );
}

export function ActivityIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function RefreshIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function DashboardIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function PatientsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="5" />
    </svg>
  );
}

export function AppointmentsIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function BillingIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21l-4-4-1 1-2-2 1-1 2 2 3-3" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 7 15.5V7a2 2 0 0 1 2-2h9l4 4v9.5z" />
    </svg>
  );
}

export function AccountingIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3v18h18" />
      <path d="M9 13l3-3 3 3 4-4" />
    </svg>
  );
}

export function InventoryIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-8-5a2 2 0 0 0-2 0l-8 5a2 2 0 0 0-1 1.73v8a2 2 0 0 0 1 1.73l8 5a2 2 0 0 0 2 0l8-5a2 2 0 0 0 1-1.73z" />
      <path d="M3 8l9 5 9-5" />
    </svg>
  );
}

export function ChatIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.14A1.65 1.65 0 0 0 9.4 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.14A1.65 1.65 0 0 0 4.6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.14a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.14a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function RolesIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7l3-7z" />
    </svg>
  );
}

export function PanelLeftCloseIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}

export function PanelLeftOpenIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18l3-6-3-6" />
    </svg>
  );
}
