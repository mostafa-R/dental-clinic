import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Pagination from "../components/ui/Pagination";
import Select from "../components/ui/Select";
import { PageLoader } from "../components/ui/Spinner";
import {
  ArrowDownTrayIcon,
  BuildingOfficeIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "../components/ui/icons";
import TenantFormModal from "../features/tenants/TenantFormModal";
import UsageQuotaModal from "../features/tenants/UsageQuotaModal";
import {
  activateTenant,
  archiveTenant,
  deleteTenant,
  fetchTenants,
  setFilters,
  setPage,
  suspendTenant,
  updateTenant,
} from "../features/tenants/tenantsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { downloadCsv } from "../lib/exportCsv";
import { TENANT_STATUS } from "../lib/roles";
import { t } from "../lib/i18n";
import { canUserAccess } from "../lib/permissions";
import { startImpersonation } from "../features/impersonation/impersonationSlice";
import api from "../lib/axios";

const statusVariants = {
  [TENANT_STATUS.ACTIVE]: "success",
  [TENANT_STATUS.TRIAL]: "info",
  [TENANT_STATUS.SUSPENDED]: "danger",
  [TENANT_STATUS.CANCELLED]: "warning",
  [TENANT_STATUS.ARCHIVED]: "default",
};

export default function Tenants() {
  const dispatch = useDispatch();
  const { items, loading, pagination, filters } = useSelector(
    (state) => state.tenants,
  );
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const impersonation = useSelector((state) => state.impersonation);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(filters.search || "");
  const [statusFilter, setStatusFilter] = useState(filters.status || "");
  const [planFilter, setPlanFilter] = useState(filters.plan || "");
  const [dormantFilter, setDormantFilter] = useState(filters.dormant || "");
  const [trialExpiringFilter, setTrialExpiringFilter] = useState(filters.trialExpiring || "");
  const [bulkPlanOpen, setBulkPlanOpen] = useState(false);
  const [bulkPlan, setBulkPlan] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareData, setCompareData] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [savedViews, setSavedViews] = useState(() => {
    try {
      const raw = localStorage.getItem("tenants_views");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [viewName, setViewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [usageTenant, setUsageTenant] = useState(null);
  const [impersonateTenant, setImpersonateTenant] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (impersonation.active && impersonation.token) {
      const clinicUrl = import.meta.env.VITE_CLINIC_URL || 'http://localhost:5173';
      const url = `${clinicUrl}/login?impersonation=${impersonation.token}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [impersonation.active, impersonation.token]);

  useEffect(() => {
    dispatch(fetchTenants({ page: pagination.page, ...filters }));
    dispatch(fetchPlans());
  }, [dispatch, pagination.page, filters]);

  useEffect(() => {
    setSelected([]);
  }, [items.length]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setSelectedTenant(null);
      setShowForm(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
    const fromParams = {};
    const statusParam = searchParams.get("status");
    if (statusParam) {
      setStatusFilter(statusParam);
      fromParams.status = statusParam;
      searchParams.delete("status");
    }
    const planParam = searchParams.get("plan");
    if (planParam) {
      setPlanFilter(planParam);
      fromParams.plan = planParam;
      searchParams.delete("plan");
    }
    const trialParam = searchParams.get("trialExpiring");
    if (trialParam) {
      setTrialExpiringFilter(trialParam);
      fromParams.trialExpiring = trialParam;
      searchParams.delete("trialExpiring");
    }
    const dormantParam = searchParams.get("dormant");
    if (dormantParam) {
      setDormantFilter(dormantParam);
      fromParams.dormant = dormantParam;
      searchParams.delete("dormant");
    }
    if (Object.keys(fromParams).length > 0) {
      dispatch(setFilters(fromParams));
      dispatch(setPage(1));
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planName = (key) => {
    const p = plans.find((pl) => pl.key === key);
    return p?.name || key;
  };

  const can = (key) => canUserAccess(user, key);

  const currentFilterParams = () => ({
    search,
    status: statusFilter,
    plan: planFilter,
    dormant: dormantFilter,
    trialExpiring: trialExpiringFilter,
  });

  const handleSearch = () => {
    dispatch(setPage(1));
    dispatch(setFilters(currentFilterParams()));
    dispatch(fetchTenants({ page: 1, ...currentFilterParams() }));
  };

  const applyView = (view) => {
    if (!view) return;
    const f = view.filters || {};
    setSearch(f.search || "");
    setStatusFilter(f.status || "");
    setPlanFilter(f.plan || "");
    setDormantFilter(f.dormant || "");
    setTrialExpiringFilter(f.trialExpiring || "");
    dispatch(setPage(1));
    dispatch(setFilters({ search: f.search || "", status: f.status || "", plan: f.plan || "", dormant: f.dormant || "", trialExpiring: f.trialExpiring || "" }));
    dispatch(fetchTenants({ page: 1, ...f }));
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next = [
      ...savedViews.filter((v) => v.name !== name),
      { name, filters: currentFilterParams() },
    ];
    setSavedViews(next);
    try {
      localStorage.setItem("tenants_views", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setViewName("");
  };

  const deleteView = (name) => {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    try {
      localStorage.setItem("tenants_views", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const openCompare = async () => {
    if (selected.length !== 2) return;
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareData([]);
    try {
      const rows = await Promise.all(
        selected.map(async (id) => {
          const [detailRes, statsRes] = await Promise.all([
            api.get(`/tenants/${id}`),
            api.get(`/tenants/${id}/stats`),
          ]);
          return { ...detailRes.data, stats: statsRes.data || {} };
        }),
      );
      setCompareData(rows);
    } catch {
      setCompareData([]);
    } finally {
      setCompareLoading(false);
    }
  };

  const runBulkPlanChange = async () => {
    if (!bulkPlan || selected.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    const results = await Promise.allSettled(
      selected.map((id) => dispatch(updateTenant({ id, data: { plan: bulkPlan } }))),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkLoading(false);
    setSelected([]);
    setBulkPlanOpen(false);
    setBulkPlan("");
    if (failed) setBulkError(t("bulkFailed", language));
    dispatch(fetchTenants({ page: pagination.page, ...filters }));
  };

  const handlePageChange = (page) => {
    dispatch(setPage(page));
  };

  const handleImpersonateClick = async (tenant) => {
    setImpersonateTenant(tenant);
    setSelectedUserId("");
    setLoadingUsers(true);
    try {
      const { data } = await api.get(`/users/by-tenant/${tenant._id}`);
      setTenantUsers(data.users || []);
    } catch {
      setTenantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleStartImpersonation = () => {
    if (!selectedUserId || !impersonateTenant) return;
    dispatch(startImpersonation({ userId: selectedUserId, tenantId: impersonateTenant._id }));
    setImpersonateTenant(null);
    setSelectedUserId("");
    setTenantUsers([]);
  };

  const statusLabel = (s) => t("status" + s.charAt(0).toUpperCase() + s.slice(1), language) || s?.charAt(0).toUpperCase() + s?.slice(1);

  const getStatusBadge = (status) => (
    <Badge variant={statusVariants[status] || "default"}>
      {statusLabel(status)}
    </Badge>
  );

  const runAction = async () => {
    const map = {
      suspend: suspendTenant,
      activate: activateTenant,
      archive: archiveTenant,
      delete: deleteTenant,
    };
    await dispatch(map[confirmAction.type](confirmAction.id));
    setConfirmAction(null);
  };

  const runBulkAction = async () => {
    const { type, ids } = bulkConfirm;
    const map = {
      suspend: suspendTenant,
      activate: activateTenant,
      archive: archiveTenant,
      delete: deleteTenant,
    };
    const eligible = ids.filter(
      (id) =>
        type !== "suspend" ||
        items.find((t) => t._id === id)?.status === TENANT_STATUS.ACTIVE,
    ).filter(
      (id) =>
        type !== "activate" ||
        items.find((t) => t._id === id)?.status === TENANT_STATUS.SUSPENDED,
    );
    setBulkLoading(true);
    setBulkError(null);
    const results = await Promise.allSettled(
      eligible.map((id) => dispatch(map[type](id))),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkLoading(false);
    setSelected([]);
    setBulkConfirm(null);
    if (failed) setBulkError(t("bulkFailed", language));
    dispatch(fetchTenants({ page: pagination.page, ...filters }));
  };

  const allSelected = items.length > 0 && selected.length === items.length;

  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(items.map((t) => t._id));
  };

  const toggleOne = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const canSuspendBulk =
    can("tenants.suspend") &&
    selected.some(
      (id) => items.find((t) => t._id === id)?.status === TENANT_STATUS.ACTIVE,
    );
  const canActivateBulk =
    can("tenants.activate") &&
    selected.some(
      (id) =>
        items.find((t) => t._id === id)?.status === TENANT_STATUS.SUSPENDED,
    );

  const exportRows = () => {
    downloadCsv({
      filename: t("exportTenants", language),
      rows: items,
      headers: [
        { label: t("clinicName", language), getValue: (r) => r.name },
        { label: t("email", language), getValue: (r) => r.email },
        { label: t("plan", language), getValue: (r) => planName(r.plan) },
        { label: t("status", language), getValue: (r) => statusLabel(r.status) },
        { label: t("tenantBranches", language), getValue: (r) => r.branchesCount ?? 0 },
        { label: t("tenantUsers", language), getValue: (r) => r.usersCount ?? 0 },
        { label: t("tenantCreated", language), getValue: (r) => formatDate(r.createdAt, language) },
      ],
    });
  };

  if (loading && !items.length) {
    return <PageLoader />;
  }

  return (
    <div className="p-6">
      <PageHeader
        title={t("tenants", language)}
        subtitle={t("tenantsDesc", language)}
        actions={
          <>
            <Button variant="outline" onClick={exportRows} icon={ArrowDownTrayIcon}>
              {t("exportCsv", language)}
            </Button>
            {can("tenants.create") && (
              <Button onClick={() => setShowForm(true)} icon={PlusIcon}>
                {t("addTenant", language)}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
        <Input
          icon={MagnifyingGlassIcon}
          placeholder={t("searchTenants", language)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="sm:max-w-64"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:max-w-48"
        >
          <option value="">{t("allStatus", language)}</option>
          <option value={TENANT_STATUS.ACTIVE}>{t("statusActive", language)}</option>
          <option value={TENANT_STATUS.TRIAL}>{t("statusTrial", language)}</option>
          <option value={TENANT_STATUS.SUSPENDED}>{t("statusSuspended", language)}</option>
          <option value={TENANT_STATUS.CANCELLED}>{t("statusCancelled", language)}</option>
        </Select>
        <Select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="sm:max-w-48"
          aria-label={t("plan", language)}
        >
          <option value="">{t("allPlans", language)}</option>
          {plans.map((p) => (
            <option key={p.key || p._id} value={p.key}>
              {p.name || p.key}
            </option>
          ))}
        </Select>
        <Select
          value={dormantFilter}
          onChange={(e) => setDormantFilter(e.target.value)}
          className="sm:max-w-48"
          aria-label={t("dormantOnly", language)}
        >
          <option value="">{t("allStatus", language)} · {t("dormantOnly", language)} ✕</option>
          <option value="true">{t("dormantOnly", language)}</option>
        </Select>
        <Select
          value={trialExpiringFilter}
          onChange={(e) => setTrialExpiringFilter(e.target.value)}
          className="sm:max-w-48"
          aria-label={t("trialExpiringWithin", language)}
        >
          <option value="">{t("trialExpiringWithin", language)}: {t("anyDays", language)}</option>
          <option value="7">{t("trialExpiringWithin", language)}: {t("days7", language)}</option>
          <option value="30">{t("trialExpiringWithin", language)}: {t("days30", language)}</option>
          <option value="60">{t("trialExpiringWithin", language)}: {t("days60", language)}</option>
        </Select>
        <Button variant="secondary" onClick={handleSearch}>
          {t("search", language)}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 mb-6">
        <Select
          value=""
          onChange={(e) => {
            const view = savedViews.find((v) => v.name === e.target.value);
            if (view) applyView(view);
          }}
          className="sm:max-w-56"
          aria-label={t("savedViews", language)}
        >
          <option value="">{t("savedViews", language)} ({savedViews.length})</option>
          {savedViews.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder={t("viewNamePh", language)}
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
          className="sm:max-w-48"
        />
        <Button variant="outline" size="sm" onClick={saveCurrentView} disabled={!viewName.trim()}>
          {t("saveView", language)}
        </Button>
        {savedViews.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) deleteView(e.target.value);
              e.target.value = "";
            }}
            defaultValue=""
            className="text-xs text-slate-400 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5"
            aria-label={t("deleteView", language)}
          >
            <option value="">{t("deleteView", language)}…</option>
            {savedViews.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {bulkError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {bulkError}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
            {t("selectedCount", { count: selected.length }, language)}
          </span>
          <div className="flex flex-wrap gap-2">
            {canSuspendBulk && (
              <Button variant="danger" size="sm" onClick={() => setBulkConfirm({ type: "suspend", ids: selected })}>
                {t("bulkSuspend", language)}
              </Button>
            )}
            {canActivateBulk && (
              <Button variant="success" size="sm" onClick={() => setBulkConfirm({ type: "activate", ids: selected })}>
                {t("bulkActivate", language)}
              </Button>
            )}
            {can("tenants.archive") && (
              <Button variant="secondary" size="sm" onClick={() => setBulkConfirm({ type: "archive", ids: selected })}>
                {t("bulkArchive", language)}
              </Button>
            )}
            {can("tenants.delete") && (
              <Button variant="danger" size="sm" onClick={() => setBulkConfirm({ type: "delete", ids: selected })}>
                {t("bulkDelete", language)}
              </Button>
            )}
            {user?.role === "super_admin" && (
              <Button variant="outline" size="sm" onClick={() => { setBulkPlan(""); setBulkPlanOpen(true); }}>
                {t("changePlan", language)}
              </Button>
            )}
            {selected.length === 2 && (
              <Button variant="outline" size="sm" onClick={openCompare}>
                {t("compareTenants", language)}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              {t("clearSelection", language)}
            </Button>
          </div>
        </div>
      )}

      <Card padding="p-0">
        {items.length === 0 ? (
          <EmptyState
            title={t("noTenantsFound", language)}
            description={t("noTenantsDesc", language)}
            icon={BuildingOfficeIcon}
            action={
              can("tenants.create") && (
                <Button onClick={() => setShowForm(true)}>
                  <PlusIcon className="w-4 h-4" />
                  {t("addTenant", language)}
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th scope="col" className="px-6 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label={t("selectAll", language)}
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("clinicName", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("plan", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("status", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("tenantBranches", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("tenantUsers", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("tenantCreated", language)}
                  </th>
                  <th scope="col" className="px-6 py-3 text-end text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {t("actions", language)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {items.map((tenant) => (
                  <tr
                    key={tenant._id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                      selected.includes(tenant._id)
                        ? "bg-indigo-50/60 dark:bg-indigo-900/10"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={`${t("selectAll", language)} ${tenant.name}`}
                        checked={selected.includes(tenant._id)}
                        onChange={() => toggleOne(tenant._id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/tenants/${tenant._id}`}
                        className="hover:text-indigo-600 dark:hover:text-indigo-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="font-medium text-slate-900 dark:text-white hover:underline">
                          {tenant.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {tenant.email}
                        </p>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="primary">
                        {planName(tenant.plan)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(tenant.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {tenant.branchesCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {tenant.usersCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatDate(tenant.createdAt, language)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/tenants/${tenant._id}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 px-2 py-1 text-sm font-medium hover:underline"
                        >
                          <EyeIcon className="w-4 h-4" />
                          {t("details", language)}
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-indigo-600 hover:text-indigo-700"
                          onClick={() => setUsageTenant(tenant)}
                        >
                          {t("usage", language)}
                        </Button>
                        {can("tenants.impersonate") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:text-amber-700"
                            onClick={() => handleImpersonateClick(tenant)}
                          >
                            {t("loginAs", language)}
                          </Button>
                        )}
                        {can("tenants.update") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setShowForm(true);
                            }}
                          >
                            {t("edit", language)}
                          </Button>
                        )}
                        {tenant.status === TENANT_STATUS.ACTIVE &&
                          can("tenants.suspend") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() =>
                                setConfirmAction({
                                  type: "suspend",
                                  id: tenant._id,
                                })
                              }
                            >
                              {t("suspendTenant", language)}
                            </Button>
                          )}
                        {tenant.status === TENANT_STATUS.SUSPENDED &&
                          can("tenants.activate") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700"
                              onClick={() =>
                                setConfirmAction({
                                  type: "activate",
                                  id: tenant._id,
                                })
                              }
                            >
                              {t("activateTenant", language)}
                            </Button>
                          )}
                        {can("tenants.archive") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-slate-700"
                            onClick={() =>
                              setConfirmAction({
                                type: "archive",
                                id: tenant._id,
                              })
                            }
                          >
                            {t("archiveTenant", language)}
                          </Button>
                        )}
                        {can("tenants.delete") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setConfirmAction({
                                type: "delete",
                                id: tenant._id,
                              })
                            }
                          >
                            {t("deleteTenant", language)}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </Card>

      <TenantFormModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedTenant(null);
        }}
        tenant={selectedTenant}
      />

      <UsageQuotaModal
        isOpen={!!usageTenant}
        onClose={() => setUsageTenant(null)}
        tenant={usageTenant}
      />

      <Modal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        title={t("compareTitle", language)}
        size="lg"
      >
        {compareLoading ? (
          <PageLoader />
        ) : compareData.length !== 2 ? (
          <p className="text-sm text-slate-500">{t("noData", language)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className="text-start px-4 py-3 font-medium text-slate-500 dark:text-slate-400" />
                  {compareData.map((c) => (
                    <th key={c._id} scope="col" className="text-start px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {[
                  { label: t("plan", language), get: (c) => planName(c.plan) },
                  { label: t("status", language), get: (c) => statusLabel(c.status) },
                  { label: t("tenantBranches", language), get: (c) => formatNumber(c.branchesCount || 0, language) },
                  { label: t("tenantUsers", language), get: (c) => formatNumber(c.usersCount || 0, language) },
                  { label: t("patients", language), get: (c) => formatNumber(c.patientsCount || 0, language) },
                  { label: t("appointments", language), get: (c) => formatNumber(c.appointmentsCount || 0, language) },
                  { label: t("totalRevenue", language), get: (c) => formatCurrency(c.stats?.totalRevenue || 0, "USD", language) },
                  { label: t("tenantCreated", language), get: (c) => formatDate(c.createdAt, language) },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{row.label}</td>
                    {compareData.map((c) => (
                      <td key={c._id} className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                        {row.get(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={bulkPlanOpen}
        onClose={() => setBulkPlanOpen(false)}
        title={t("bulkPlanTitle", { count: selected.length }, language)}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("newPlan", language)}
            </label>
            <Select value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value)}>
              <option value="">{t("selectPlanPrompt", language)}</option>
              {plans.map((p) => (
                <option key={p.key || p._id} value={p.key}>
                  {p.name || p.key}{p.price != null ? ` — $${p.price}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setBulkPlanOpen(false)}>
              {t("cancel", language)}
            </Button>
            <Button onClick={runBulkPlanChange} loading={bulkLoading} disabled={!bulkPlan}>
              {t("changePlan", language)}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!impersonateTenant} onClose={() => { setImpersonateTenant(null); setTenantUsers([]); }}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("loginAs", language)} — {impersonateTenant?.name}
          </h3>
          {loadingUsers ? (
            <PageLoader />
          ) : tenantUsers.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noData", language)}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tenantUsers.map((u) => (
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
                    <p className="text-xs text-slate-500">{u.email} • {u.roleId?.name || u.role || ""}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => { setImpersonateTenant(null); setTenantUsers([]); }}>
              {t("cancel", language)}
            </Button>
            <Button onClick={handleStartImpersonation} disabled={!selectedUserId}>
              {t("loginAs", language)}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={t(
          confirmAction?.type === "suspend"
            ? "suspendTitle"
            : confirmAction?.type === "archive"
            ? "archiveTitle"
            : confirmAction?.type === "delete"
            ? "deleteTitle"
            : "activateTitle",
          language,
        )}
        message={t(
          confirmAction?.type === "suspend"
            ? "suspendConfirm"
            : confirmAction?.type === "activate"
            ? "activateConfirm"
            : confirmAction?.type === "archive"
            ? "archiveConfirm"
            : "deleteConfirm",
          language,
        )}
        confirmLabel={t(
          confirmAction?.type === "suspend"
            ? "suspendTenant"
            : confirmAction?.type === "activate"
            ? "activateTenant"
            : confirmAction?.type === "archive"
            ? "archiveTenant"
            : "deleteTenant",
          language,
        )}
        cancelLabel={t("cancel", language)}
        variant={confirmAction?.type === "activate" ? "primary" : "danger"}
        onConfirm={runAction}
      />

      <ConfirmDialog
        isOpen={!!bulkConfirm}
        onClose={() => setBulkConfirm(null)}
        title={t(
          bulkConfirm?.type === "suspend"
            ? "bulkSuspendTitle"
            : bulkConfirm?.type === "activate"
            ? "bulkActivateTitle"
            : bulkConfirm?.type === "archive"
            ? "bulkArchiveTitle"
            : "deleteTitle",
          language,
        )}
        message={t(
          bulkConfirm?.type === "suspend"
            ? "bulkSuspendMessage"
            : bulkConfirm?.type === "activate"
            ? "bulkActivateMessage"
            : bulkConfirm?.type === "archive"
            ? "bulkArchiveMessage"
            : "bulkDeleteMessage",
          { count: bulkConfirm?.ids?.length || 0 },
          language,
        )}
        confirmLabel={t("confirm", language)}
        cancelLabel={t("cancel", language)}
        variant={bulkConfirm?.type === "activate" ? "primary" : "danger"}
        loading={bulkLoading}
        onConfirm={runBulkAction}
      />
    </div>
  );
}