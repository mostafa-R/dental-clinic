import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useT } from '../../lib/i18n';
import { moduleAccessStatus } from '../../lib/roles';
import { navRouteForModule } from '../../lib/routes';
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
    bg: 'bg-brand',
  },
  appointments: {
    icon: AppointmentsIcon,
    bg: 'bg-brand',
  },
  billing: {
    icon: BillingIcon,
    bg: 'bg-amber-500',
  },
  accounting: {
    icon: AccountingIcon,
    bg: 'bg-sky-600',
  },
  inventory: {
    icon: InventoryIcon,
    bg: 'bg-violet-500',
  },
  branches: {
    icon: BranchIcon,
    bg: 'bg-sky-500',
  },
  chat: {
    icon: ChatIcon,
    bg: 'bg-rose-500',
  },
  users: {
    icon: UsersIcon,
    bg: 'bg-brand',
  },
  roles: {
    icon: RolesIcon,
    bg: 'bg-violet-600',
  },
  settings: {
    icon: SettingsIcon,
    bg: 'bg-slate-600',
  },
};

const DEFAULT_MODULE = {
  icon: PatientsIcon,
  bg: 'bg-brand',
};

/**
 * The modules this user can open from here.
 *
 * The server already filters the list down to plan ∩ granted permissions, but
 * the check is repeated here with the same `moduleAccessStatus` predicate the
 * sidebar and the URL guard use, so a payload cached before a plan downgrade or
 * a role edit cannot keep rendering a card that leads to AccessDenied.
 *
 * `navRouteForModule` also drops anything with no page of its own (`emr` lives
 * under a patient, `platform_settings` is not a client route). Linking to
 * `/${key}` instead used to send those to the 404 page — and 404 is not a
 * registered route, so `moduleForPath` returned `null` and the permission guard
 * never ran at all.
 */
export default function ModulesGrid({ modules = [] }) {
  const { t } = useT();
  const myPermissions = useSelector((s) => s.users?.myPermissions);

  // `moduleAccessStatus` is used instead of the boolean `checkModuleAccess`
  // because the three outcomes are not the same. `unknown` means the current
  // user's permissions have not loaded yet, and treating that as "denied"
  // rendered "no modules in your plan yet" on every single page load — a
  // false statement about the plan, shown to a fully entitled user, replaced a
  // moment later by the real grid.
  const loaded = !!myPermissions;

  const visible = modules.filter((m) => {
    if (moduleAccessStatus(myPermissions, m.key) !== 'granted') return false;
    return navRouteForModule(m.key) !== null;
  });

  // Nothing is known yet: render no claim at all rather than an empty plan.
  if (!loaded) return null;

  if (visible.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500 dark:text-slate-400">
        {t('dashboard.noModules')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {visible.map((m) => {
        const config = MODULE_CONFIG[m.key] || DEFAULT_MODULE;
        const Icon = config.icon;
        const route = navRouteForModule(m.key);
        return (
          <Link
            key={m.key}
            to={route.path}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand/30 dark:hover:bg-slate-800"
          >
            <div className="flex items-start gap-3.5">
              <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.bg} text-white shadow-sm`}>
                <Icon width={20} height={20} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(`mod.${m.key}`) === `mod.${m.key}` ? m.label : t(`mod.${m.key}`)}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand-dark transition-colors dark:bg-brand/20 dark:text-brand-light">
                {t('common.open')}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
