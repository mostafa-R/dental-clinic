import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import UsageQuotaBar from "../components/ui/UsageQuotaBar";
import { PageLoader } from "../components/ui/Spinner";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  BanknoteIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ClockIcon,
  CogIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersIcon,
} from "../components/ui/icons";
import api from "../lib/axios";
import UsageQuotaModal from "../features/tenants/UsageQuotaModal";
import TenantFormModal from "../features/tenants/TenantFormModal";
import {
  activateTenant,
  archiveTenant,
  deleteTenant,
  suspendTenant,
  updateTenant,
} from "../features/tenants/tenantsSlice";
import {
  fetchTenantAuditLogs,
  fetchTenantBranches,
  fetchTenantDetail,
  fetchTenantStats,
  fetchTenantUsers,
} from "../features/tenants/tenantDetailSlice";
import { fetchTenantUsage } from "../features/analytics/analyticsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import { startImpersonation } from "../features/impersonation/impersonationSlice";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../lib/format";
import { t } from "../lib/i18n";
import { canUserAccess } from "../lib/permissions";
import { TENANT_STATUS } from "../lib/roles";
import { actionVariant } from "../lib/audit";

const statConfig = [
  { key: "branchesCount", labelKey: "tenantBranches", variant: "default", icon: BuildingOfficeIcon },
  { key: "usersCount", labelKey: "tenantUsers", variant: "info", icon: UsersIcon },
  { key: "doctorsCount", labelKey: "doctors", variant: "success", icon: UserCircleIcon },
  { key: "patientsCount", labelKey: "patients", variant: "warning", icon: ShieldCheckIcon },
  { key: "appointmentsCount", labelKey: "appointments", variant: "danger", icon: ClockIcon },
];

const statusVariants = {
  [TENANT_STATUS.ACTIVE]: "success",
  [TENANT_STATUS.TRIAL]: "info",
  [TENANT_STATUS.SUSPENDED]: "danger",
  [TENANT_STATUS.CANCELLED]: "warning",
  [TENANT_STATUS.ARCHIVED]: "default",
};

const linkClass =
  "inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline";

export default function TenantDetail() {
  const dispatch = useDispatch();
  const { id } = useParams();
  const { tenant, stats, branches, users, activity, loading } = useSelector(
    (state) => state.tenantDetail,
  );
  const { items: plans } = useSelector((state) => state.plans);
  const { tenantUsage } = useSelector((state) => state.analytics);
  const { language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);

  const [showForm, setShowForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingPlan, setBillingPlan] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMsg, setBillingMsg] = useState(null);
  const [billingError, setBillingError] = useState(null);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [impersonateUsers, setImpersonateUsers] = useState([]);

  useEffect(() => {
    if (!id) return;
    dispatch(fetchTenantDetail(id));
    dispatch(fetchTenantStats(id));
    dispatch(fetchTenantBranches(id));
    dispatch(fetchTenantUsers(id));
    dispatch(fetchTenantAuditLogs(id));
    dispatch(fetchTenantUsage(id));
    dispatch(fetchPlans());
  }, [dispatch, id]);

  const can = (key) => canUserAccess(user, key);

  const planName = (key) => {
    const p = plans.find((pl) => pl.key === key);
    return p?.name || key;
  };

  const statusLabel = (s) =>
    t("status" + s.charAt(0).toUpperCase() + s.slice(1), language) ||
    s?.charAt(0).toUpperCase() + s?.slice(1);

  const getStatusBadge = (status) => (
    <Badge variant={statusVariants[status] || "default"}>
      {statusLabel(status)}
    </Badge>
  );

  const openImpersonate = async () => {
    setImpersonateOpen(true);
    setSelectedUserId("");
    try {
      const { data } = await api.get(`/users/by-tenant/${id}`);
      setImpersonateUsers(data.users || []);
    } catch {
      setImpersonateUsers([]);
    }
  };

  const handleStartImpersonation = () => {
    if (!selectedUserId || !tenant) return;
    dispatch(startImpersonation({ userId: selectedUserId, tenantId: tenant._id }));
    setImpersonateOpen(false);
    setSelectedUserId("");
  };

  const runAction = async () => {
    const map = {
      suspend: suspendTenant,
      activate: activateTenant,
      archive: archiveTenant,
      delete: deleteTenant,
    };
    await dispatch(map[confirmAction.type](confirmAction.id));
    setConfirmAction(null);
    dispatch(fetchTenantDetail(id));
  };

  const isSuperAdmin = user?.role === "super_admin";

  const openBilling = () => {
    setBillingPlan(tenant?.plan || "");
    setBillingMsg(null);
    setBillingError(null);
    setBillingOpen(true);
  };

  const refreshTenant = () => {
    dispatch(fetchTenantDetail(id));
    dispatch(fetchTenantStats(id));
  };

  const handlePlanChange = async () => {
    if (!billingPlan || billingPlan === tenant.plan) return;
    setBillingLoading(true);
    setBillingError(null);
    setBillingMsg(null);
    try {
      const result = await dispatch(updateTenant({ id: tenant._id, data: { plan: billingPlan } }));
      if (result.error) {
        setBillingError(result.payload || t("failedUpdateTenant", language));
      } else {
        setBillingMsg(t("planChangeSuccess", language));
        refreshTenant();
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingMsg(null);
    try {
      const result = await dispatch(updateTenant({ id: tenant._id, data: { status: TENANT_STATUS.TRIAL } }));
      if (result.error) {
        setBillingError(result.payload || t("failedUpdateTenant", language));
      } else {
        setBillingMsg(t("trialExtendedMsg", language));
        refreshTenant();
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const handleActivateNow = async () => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingMsg(null);
    try {
      const result = await dispatch(activateTenant(tenant._id));
      if (result.error) {
        setBillingError(result.payload || t("failedUpdateTenant", language));
      } else {
        setBillingMsg(t("planChangeSuccess", language));
        refreshTenant();
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const printReport = () => {
    const esc = (s) =>
      String(s ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const infoRows = [
      [t("plan", language), planName(tenant.plan)],
      [t("status", language), statusLabel(tenant.status)],
      [t("email", language), tenant.email],
      [t("phone", language), tenant.phone],
      [t("location", language), [tenant.city, tenant.country].filter(Boolean).join(", ")],
      [t("tenantCreated", language), formatDate(tenant.createdAt, language)],
      [t("trialEnds", language), tenant.trialEndsAt ? formatDate(tenant.trialEndsAt, language) : null],
      [t("subscriptionEnds", language), tenant.subscriptionEndsAt ? formatDate(tenant.subscriptionEndsAt, language) : null],
      [t("timezone", language), tenant.timezone],
    ].filter(([, v]) => v);
    const statRows = [
      [t("tenantBranches", language), stats?.branchesCount ?? 0],
      [t("tenantUsers", language), stats?.usersCount ?? 0],
      [t("patients", language), stats?.patientsCount ?? 0],
      [t("appointments", language), stats?.appointmentsCount ?? 0],
      [t("totalRevenue", language), formatCurrency(stats?.totalRevenue || 0, "USD", language)],
    ];
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${esc(tenant.name)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111;padding:32px;max-width:800px;margin:auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}.muted{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:start;border-bottom:1px solid #eee;padding:8px 6px}th{color:#555;font-weight:600}</style>
</head><body>
<h1>${esc(tenant.name)}</h1>
<p class="muted">${esc(t("reportTitle", language))} · ${esc(new Date().toLocaleString())}</p>
<h2>${esc(t("tenantSubscription", language))}</h2>
<table>${infoRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<h2>${esc(t("platformStatistics", language))}</h2>
<table>${statRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<h2>${esc(t("tenantBranchesSection", language))} (${branches.length})</h2>
<table><tr><th>${esc(t("branchName", language))}</th><th>${esc(t("phone", language))}</th><th>${esc(t("status", language))}</th></tr>
${branches.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.phone)}</td><td>${esc(b.isActive ? t("active", language) : t("inactive", language))}</td></tr>`).join("")}</table>
<h2>${esc(t("tenantUsersSection", language))} (${users.length})</h2>
<table><tr><th>${esc(t("name", language))}</th><th>${esc(t("email", language))}</th><th>${esc(t("role", language))}</th></tr>
${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.roleId?.name || u.role)}</td></tr>`).join("")}</table>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const exportTenantJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tenant,
      stats,
      usage: tenantUsage,
      branches,
      users,
      activity: activity?.slice(0, 50),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenant-${tenant?.slug || tenant?._id || "data"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const confirmCopy = {
    suspend: {
      title: t("suspendTitle", language),
      message: t("suspendConfirm", language),
      label: t("suspendTenant", language),
    },
    activate: {
      title: t("activateTitle", language),
      message: t("activateConfirm", language),
      label: t("activateTenant", language),
    },
    archive: {
      title: t("archiveTitle", language),
      message: t("archiveConfirm", language),
      label: t("archiveTenant", language),
    },
    delete: {
      title: t("deleteTitle", language),
      message: t("deleteConfirm", language),
      label: t("deleteTenant", language),
    },
  };

  const statValue = (key) =>
    key === "totalRevenue"
      ? formatCurrency(stats?.totalRevenue || 0, "USD", language)
      : formatNumber(stats?.[key] || 0, language);

  const usageBars = [
    {
      label: t("branchesLabel", language),
      used: tenantUsage?.branches?.used || 0,
      limit: tenantUsage?.branches?.limit || 0,
      color: "indigo",
    },
    {
      label: t("doctorsLabel", language),
      used: tenantUsage?.doctors?.used || 0,
      limit: tenantUsage?.doctors?.limit || 0,
      color: "emerald",
    },
    {
      label: t("patientsLabel", language),
      used: tenantUsage?.patients?.used || 0,
      limit: tenantUsage?.patients?.limit || 0,
      color: "blue",
    },
    {
      label: t("storageLabel", language),
      used: Math.round((tenantUsage?.storage?.used || 0) / 1024),
      limit: Math.round((tenantUsage?.storage?.limit || 0) / 1024),
      unit: "GB",
      color: "purple",
    },
  ];

  if (loading && !tenant) {
    return <PageLoader />;
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <EmptyState
          title={t("tenantNotFound", language)}
          description={t("tenantNotFoundDesc", language)}
          icon={BuildingOfficeIcon}
          action={
            <Link to="/tenants" className={linkClass}>
              <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
              {t("backToTenants", language)}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link to="/tenants" className={linkClass}>
        <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
        {t("backToTenants", language)}
      </Link>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Overview */}
        <Card className="xl:col-span-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <BuildingOfficeIcon className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {tenant.name}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tenant.email}
                </p>
              </div>
            </div>
            {getStatusBadge(tenant.status)}
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("plan", language)}</dt>
              <dd>
                <Badge variant="primary">{planName(tenant.plan)}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("tenantCreated", language)}</dt>
              <dd className="text-slate-900 dark:text-white font-medium">
                {formatDate(tenant.createdAt, language)}
              </dd>
            </div>
            {tenant.phone && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("phone", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium" dir="ltr">
                  {tenant.phone}
                </dd>
              </div>
            )}
            {(tenant.city || tenant.country) && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("location", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium">
                  {[tenant.city, tenant.country].filter(Boolean).join(", ")}
                </dd>
              </div>
            )}
            {tenant.trialEndsAt && tenant.status === TENANT_STATUS.TRIAL && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("trialEnds", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium">
                  {formatDate(tenant.trialEndsAt, language)}
                </dd>
              </div>
            )}
            {tenant.subscriptionEndsAt && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("subscriptionEnds", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium">
                  {formatDate(tenant.subscriptionEndsAt, language)}
                </dd>
              </div>
            )}
            {tenant.timezone && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("timezone", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium" dir="ltr">
                  {tenant.timezone}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("tenantId", language)}</dt>
              <dd className="text-slate-900 dark:text-white font-mono text-xs">
                {tenant._id}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setUsageOpen(true)}>
              {t("usage", language)}
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" icon={BanknoteIcon} onClick={openBilling}>
                {t("billing", language)}
              </Button>
            )}
            <Button variant="outline" size="sm" icon={ArrowDownTrayIcon} onClick={exportTenantJson}>
              {t("exportTenantData", language)}
            </Button>
            <Button variant="outline" size="sm" onClick={printReport}>
              {t("printReport", language)}
            </Button>
            {can("tenants.update") && (
              <Button variant="outline" size="sm" icon={CogIcon} onClick={() => setShowForm(true)}>
                {t("edit", language)}
              </Button>
            )}
            {can("tenants.impersonate") && (
              <Button variant="secondary" size="sm" icon={MagnifyingGlassIcon} onClick={openImpersonate}>
                {t("loginAs", language)}
              </Button>
            )}
          </div>

          {can("tenants.suspend") || can("tenants.activate") || can("tenants.archive") || can("tenants.delete") ? (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex flex-wrap gap-2">
                {tenant.status === TENANT_STATUS.ACTIVE && can("tenants.suspend") && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmAction({ type: "suspend", id: tenant._id })}>
                    {t("suspendTenant", language)}
                  </Button>
                )}
                {tenant.status === TENANT_STATUS.SUSPENDED && can("tenants.activate") && (
                  <Button variant="success" size="sm" icon={CheckCircleIcon} onClick={() => setConfirmAction({ type: "activate", id: tenant._id })}>
                    {t("activateTenant", language)}
                  </Button>
                )}
                {can("tenants.archive") && (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmAction({ type: "archive", id: tenant._id })}>
                    {t("archiveTenant", language)}
                  </Button>
                )}
                {can("tenants.delete") && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmAction({ type: "delete", id: tenant._id })}>
                    {t("deleteTenant", language)}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Statistics + Usage */}
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {statConfig.map((s) => (
              <StatCard
                key={s.key}
                title={t(s.labelKey, language)}
                value={statValue(s.key)}
                icon={s.icon}
                variant={s.variant}
              />
            ))}
            <StatCard
              title={t("totalRevenue", language)}
              value={statValue("totalRevenue")}
              icon={BanknoteIcon}
              variant="success"
            />
          </div>

          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              {t("usageQuotas", language)}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("planLimits", language)}
            </p>
            {tenantUsage ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {usageBars.map((b) => (
                  <UsageQuotaBar key={b.label} {...b} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("noData", language)}</p>
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              {t("tenantSubscription", language)}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("subscriptionDetailsDesc", language)}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("plan", language)}</dt>
                <dd>
                  <Badge variant="primary">{planName(tenant.plan)}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("status", language)}</dt>
                <dd>{getStatusBadge(tenant.status)}</dd>
              </div>
              {tenant.trialEndsAt && tenant.status === TENANT_STATUS.TRIAL && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t("trialEnds", language)}</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {formatDate(tenant.trialEndsAt, language)}
                  </dd>
                </div>
              )}
              {tenant.subscriptionEndsAt && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t("subscriptionEnds", language)}</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {formatDate(tenant.subscriptionEndsAt, language)}
                  </dd>
                </div>
              )}
              {tenant.timezone && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t("timezone", language)}</dt>
                  <dd className="text-slate-900 dark:text-white font-medium" dir="ltr">
                    {tenant.timezone}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t("tenantCreated", language)}</dt>
                <dd className="text-slate-900 dark:text-white font-medium">
                  {formatDate(tenant.createdAt, language)}
                </dd>
              </div>
            </dl>
            <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                {t("planLimits", language)}
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  { labelKey: "maxBranches", value: stats?.planLimits?.maxBranches },
                  { labelKey: "maxDoctors", value: stats?.planLimits?.maxDoctors },
                  { labelKey: "maxPatients", value: stats?.planLimits?.maxPatients },
                  {
                    labelKey: "storage",
                    value: stats?.planLimits?.storageLimit ?? stats?.planLimits?.storage,
                    storage: true,
                  },
                ].map((row) => {
                  const v = row.value;
                  const display =
                    v === 0 || v == null || v === false
                      ? t("unlimited", language)
                      : row.storage
                        ? (() => {
                            const mb =
                              typeof v === "string" ? parseInt(v, 10) : v;
                            return Number.isNaN(mb)
                              ? String(v)
                              : `${(mb / 1024).toFixed(1)} GB`;
                          })()
                        : formatNumber(v, language);
                  return (
                    <div
                      key={row.labelKey}
                      className="flex items-center justify-between"
                    >
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t(row.labelKey, language)}
                      </dt>
                      <dd className="text-slate-900 dark:text-white font-medium">
                        {display}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </Card>
        </div>
      </div>

      {/* Branches */}
      <Card className="mt-6">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("tenantBranchesSection", language)}
          </h3>
          <span className="text-sm text-slate-500">{branches.length}</span>
        </div>
        {branches.length === 0 ? (
          <EmptyState title={t("noBranches", language)} icon={BuildingOfficeIcon} />
        ) : (
          <div className="overflow-x-auto pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-start">
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("branchName", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("phone", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("address", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("status", language)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {branches.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{b.name}</td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300" dir="ltr">{b.phone || "—"}</td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{b.address || "—"}</td>
                    <td className="px-6 py-3">
                      <Badge variant={b.isActive ? "success" : "default"}>
                        {t(b.isActive ? "active" : "inactive", language)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Users */}
      <Card className="mt-6">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("tenantUsersSection", language)}
          </h3>
          <span className="text-sm text-slate-500">{users.length}</span>
        </div>
        {users.length === 0 ? (
          <EmptyState title={t("noUsers", language)} icon={UsersIcon} />
        ) : (
          <div className="overflow-x-auto pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("name", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("email", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("role", language)}</th>
                  <th className="text-start px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{t("status", language)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <UserCircleIcon className="w-5 h-5 text-slate-400" />
                        {u.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{u.email || "—"}</td>
                    <td className="px-6 py-3">
                      <Badge variant="primary" size="sm">
                        {u.roleId?.name || u.role || "—"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={u.isActive === false ? "default" : "success"} size="sm">
                        {t(u.isActive === false ? "inactive" : "active", language)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Activity */}
      <Card className="mt-6">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("tenantActivity", language)}
          </h3>
          <Link to="/audit-logs?targetType=tenant" className={linkClass}>
            {t("viewAll", language)}
          </Link>
        </div>
        {activity.length === 0 ? (
          <EmptyState title={t("noActivity", language)} icon={ClockIcon} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50 pb-2">
            {activity.slice(0, 15).map((log) => (
              <li key={log._id} className="px-6 py-3 flex items-center gap-4">
                <Badge variant={actionVariant(log.action)} size="sm">
                  {t(log.action, language)}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                    {log.target?.name || log.target?.type || t("tenant", language)}
                    <span className="text-slate-400"> · </span>
                    {log.admin?.name || log.adminEmail}
                  </p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {formatDateTime(log.createdAt, language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <UsageQuotaModal isOpen={usageOpen} onClose={() => setUsageOpen(false)} tenant={tenant} />
      <TenantFormModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          dispatch(fetchTenantDetail(id));
        }}
        tenant={tenant}
      />

      <Modal isOpen={impersonateOpen} onClose={() => setImpersonateOpen(false)} title={`${t("loginAs", language)} — ${tenant.name}`}>
        <div className="space-y-4">
          {impersonateUsers.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noData", language)}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {impersonateUsers.map((u) => (
                <label
                  key={u._id}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${
                    selectedUserId === u._id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                  onClick={() => setSelectedUserId(u._id)}
                >
                  <input type="radio" name="user" checked={selectedUserId === u._id} readOnly className="sr-only" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email} • {typeof u.role === "string" ? u.role : ""}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setImpersonateOpen(false)}>
              {t("cancel", language)}
            </Button>
            <Button onClick={handleStartImpersonation} disabled={!selectedUserId}>
              {t("loginAs", language)}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={billingOpen} onClose={() => setBillingOpen(false)} title={t("billingTitle", language)} size="md">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("billingDesc", language)}
        </p>
        {billingMsg && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
            {billingMsg}
          </div>
        )}
        {billingError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {billingError}
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span className="text-sm text-slate-500 dark:text-slate-400">{t("currentPlan", language)}</span>
            <Badge variant="primary">{planName(tenant.plan)}</Badge>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("newPlan", language)}
            </label>
            <select
              value={billingPlan}
              onChange={(e) => setBillingPlan(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {(plans.length > 0 ? plans : [{ key: tenant.plan, name: planName(tenant.plan), price: null }]).map((p) => (
                <option key={p.key || p._id} value={p.key}>
                  {p.name || p.key}{p.price != null ? ` — $${p.price}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handlePlanChange} loading={billingLoading} disabled={!billingPlan || billingPlan === tenant.plan}>
              {t("changePlan", language)}
            </Button>
            {tenant.status === TENANT_STATUS.TRIAL && (
              <Button variant="secondary" onClick={handleExtendTrial} loading={billingLoading}>
                {t("extendTrial", language)}
              </Button>
            )}
            {tenant.status !== TENANT_STATUS.ACTIVE && (
              <Button variant="secondary" onClick={handleActivateNow} loading={billingLoading}>
                {t("activateNow", language)}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmCopy[confirmAction?.type]?.title}
        message={confirmCopy[confirmAction?.type]?.message}
        confirmLabel={confirmCopy[confirmAction?.type]?.label}
        cancelLabel={t("cancel", language)}
        variant={confirmAction?.type === "activate" ? "primary" : "danger"}
        onConfirm={runAction}
      />
    </div>
  );
}