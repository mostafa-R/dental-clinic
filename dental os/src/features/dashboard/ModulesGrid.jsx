import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import {
  PatientsIcon,
  BillingIcon,
  AppointmentsIcon,
  AccountingIcon,
  InventoryIcon,
  ChatIcon,
  SettingsIcon,
  RolesIcon,
  BranchIcon,
  UsersIcon,
} from '../../components/ui/icons';

const MODULE_CONFIG = {
  patients: {
    icon: PatientsIcon,
    bg: 'bg-emerald-600',
    descKey: 'nav.patients',
  },
  appointments: {
    icon: AppointmentsIcon,
    bg: 'bg-indigo-600',
    descKey: 'nav.appointments',
  },
  billing: {
    icon: BillingIcon,
    bg: 'bg-amber-500',
    descKey: 'nav.billing',
  },
  accounting: {
    icon: AccountingIcon,
    bg: 'bg-sky-600',
    descKey: 'nav.accounting',
  },
  inventory: {
    icon: InventoryIcon,
    bg: 'bg-violet-500',
    descKey: 'nav.inventory',
  },
  branches: {
    icon: BranchIcon,
    bg: 'bg-cyan-600',
    descKey: 'nav.branches',
  },
  chat: {
    icon: ChatIcon,
    bg: 'bg-rose-500',
    descKey: 'nav.chat',
  },
  users: {
    icon: UsersIcon,
    bg: 'bg-indigo-500',
    descKey: 'nav.users',
  },
  roles: {
    icon: RolesIcon,
    bg: 'bg-fuchsia-500',
    descKey: 'nav.roles',
  },
  settings: {
    icon: SettingsIcon,
    bg: 'bg-slate-600',
    descKey: 'nav.settings',
  },
};

const DEFAULT_MODULE = {
  icon: PatientsIcon,
  bg: 'bg-indigo-600',
  descKey: 'dashboard.modules',
};

export default function ModulesGrid({ modules }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {modules.map((m) => {
        const config = MODULE_CONFIG[m.key] || DEFAULT_MODULE;
        const Icon = config.icon;
        return (
          <Link
            key={m.key}
            to={m.enabled ? `/${m.key}` : '#'}
            className={`group relative overflow-hidden rounded-xl border bg-white p-4 transition-colors duration-150 ${
              m.enabled
                ? 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500/30 dark:hover:bg-slate-800'
                : 'border-slate-100 opacity-75 dark:border-slate-800 dark:bg-slate-800/50'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.bg} text-white shadow-sm`}>
                <Icon width={20} height={20} />
                {!m.enabled && (
                  <div className="absolute inset-0 rounded-xl bg-white/40 dark:bg-black/40" />
                )}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{m.label}</span>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {t(config.descKey)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                m.enabled
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                {m.enabled ? t('common.open') : t('common.inDevelopment')}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
