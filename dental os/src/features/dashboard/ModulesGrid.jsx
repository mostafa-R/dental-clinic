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
    gradient: 'from-emerald-500 to-teal-500',
    shadow: 'shadow-emerald-500/20',
    descKey: 'nav.patients',
  },
  appointments: {
    icon: AppointmentsIcon,
    gradient: 'from-indigo-500 to-blue-500',
    shadow: 'shadow-indigo-500/20',
    descKey: 'nav.appointments',
  },
  billing: {
    icon: BillingIcon,
    gradient: 'from-amber-500 to-orange-500',
    shadow: 'shadow-amber-500/20',
    descKey: 'nav.billing',
  },
  accounting: {
    icon: AccountingIcon,
    gradient: 'from-sky-500 to-cyan-500',
    shadow: 'shadow-sky-500/20',
    descKey: 'nav.accounting',
  },
  inventory: {
    icon: InventoryIcon,
    gradient: 'from-violet-500 to-purple-500',
    shadow: 'shadow-violet-500/20',
    descKey: 'nav.inventory',
  },
  branches: {
    icon: BranchIcon,
    gradient: 'from-teal-500 to-emerald-500',
    shadow: 'shadow-teal-500/20',
    descKey: 'nav.branches',
  },
  chat: {
    icon: ChatIcon,
    gradient: 'from-pink-500 to-rose-500',
    shadow: 'shadow-pink-500/20',
    descKey: 'nav.chat',
  },
  users: {
    icon: UsersIcon,
    gradient: 'from-purple-500 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    descKey: 'nav.users',
  },
  roles: {
    icon: RolesIcon,
    gradient: 'from-rose-500 to-red-500',
    shadow: 'shadow-rose-500/20',
    descKey: 'nav.roles',
  },
  settings: {
    icon: SettingsIcon,
    gradient: 'from-slate-500 to-gray-600',
    shadow: 'shadow-slate-500/20',
    descKey: 'nav.settings',
  },
};

const DEFAULT_MODULE = {
  icon: PatientsIcon,
  gradient: 'from-indigo-500 to-blue-500',
  shadow: 'shadow-indigo-500/20',
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
            className={`group relative overflow-hidden rounded-xl border bg-white p-4 transition-all duration-200 ${
              m.enabled
                ? 'border-slate-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500/30 dark:hover:shadow-lg dark:hover:shadow-indigo-500/5'
                : 'border-slate-100 opacity-75 dark:border-slate-800 dark:bg-slate-800/50'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} text-white shadow-lg ${config.shadow} transition-all duration-200 group-hover:scale-110 group-hover:shadow-xl`}>
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
                  ? 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300'
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
