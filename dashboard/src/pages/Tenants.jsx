import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Pagination from "../components/ui/Pagination";
import { PageLoader } from "../components/ui/Spinner";
import {
  BuildingOfficeIcon,
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
  setPage,
  suspendTenant,
} from "../features/tenants/tenantsSlice";
import { fetchPlans } from "../features/plans/plansSlice";
import { formatDate } from "../lib/format";
import { TENANT_STATUS } from "../lib/roles";
import { t } from "../lib/i18n";
import { startImpersonation } from "../features/impersonation/impersonationSlice";
import api from "../lib/axios";

export default function Tenants() {
  const dispatch = useDispatch();
  const { items, loading, pagination, filters } = useSelector(
    (state) => state.tenants,
  );
  const { items: plans } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const impersonation = useSelector((state) => state.impersonation);
  const [search, setSearch] = useState(filters.search || "");
  const [statusFilter, setStatusFilter] = useState(filters.status || "");
  const [showForm, setShowForm] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [usageTenant, setUsageTenant] = useState(null);
  const [impersonateTenant, setImpersonateTenant] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Open clinic frontend in new tab when impersonation starts
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

  const planName = (key) => {
    const p = plans.find((pl) => pl.key === key);
    return p?.name || key;
  };

  const handleSearch = () => {
    dispatch(setPage(1));
    dispatch(fetchTenants({ page: 1, search, status: statusFilter }));
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

  const handleSuspend = async () => {
    await dispatch(suspendTenant(confirmAction.id));
    setConfirmAction(null);
  };

  const handleActivate = async () => {
    await dispatch(activateTenant(confirmAction.id));
    setConfirmAction(null);
  };

  const handleArchive = async () => {
    await dispatch(archiveTenant(confirmAction.id));
    setConfirmAction(null);
  };

  const handleDelete = async () => {
    await dispatch(deleteTenant(confirmAction.id));
    setConfirmAction(null);
  };

  const statusLabel = (s) => t("status" + s.charAt(0).toUpperCase() + s.slice(1), language) || s?.charAt(0).toUpperCase() + s?.slice(1);

  const getStatusBadge = (status) => {
    const variants = {
      [TENANT_STATUS.ACTIVE]: "success",
      [TENANT_STATUS.TRIAL]: "info",
      [TENANT_STATUS.SUSPENDED]: "danger",
      [TENANT_STATUS.CANCELLED]: "warning",
      [TENANT_STATUS.ARCHIVED]: "default",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {statusLabel(status)}
      </Badge>
    );
  };

  if (loading && !items.length) {
    return (
      <AppLayout>
        <Topbar title={t("tenants", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("tenants", language)} />
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder={t("searchTenants", language)}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="ps-10 pe-4 py-2 w-full sm:w-64 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{t("allStatus", language)}</option>
              <option value={TENANT_STATUS.ACTIVE}>{t("statusActive", language)}</option>
              <option value={TENANT_STATUS.TRIAL}>{t("statusTrial", language)}</option>
              <option value={TENANT_STATUS.SUSPENDED}>{t("statusSuspended", language)}</option>
              <option value={TENANT_STATUS.CANCELLED}>{t("statusCancelled", language)}</option>
            </select>
            <Button variant="secondary" onClick={handleSearch}>
              {t("search", language)}
            </Button>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="w-4 h-4" />
            {t("addTenant", language)}
          </Button>
        </div>

        <Card padding="p-0">
          {items.length === 0 ? (
            <EmptyState
              title={t("noTenantsFound", language)}
              description={t("noTenantsDesc", language)}
              icon={BuildingOfficeIcon}
              action={
                <Button onClick={() => setShowForm(true)}>
                  <PlusIcon className="w-4 h-4" />
                  {t("addTenant", language)}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("clinicName", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("plan", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("status", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("tenantBranches", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("tenantUsers", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("tenantCreated", language)}
                    </th>
                    <th className="px-6 py-3 text-end text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("actions", language)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {items.map((tenant) => (
                    <tr
                      key={tenant._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {tenant.name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {tenant.email}
                          </p>
                        </div>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-600 hover:text-indigo-700"
                            onClick={() => setUsageTenant(tenant)}
                          >
                            {t("usage", language)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:text-amber-700"
                            onClick={() => handleImpersonateClick(tenant)}
                          >
                            {t("loginAs", language)}
                          </Button>
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
                          {tenant.status === TENANT_STATUS.ACTIVE && (
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
                          {tenant.status === TENANT_STATUS.SUSPENDED && (
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
      </div>

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
                    <p className="text-xs text-slate-500">{u.email} • {u.role}</p>
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

      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === "suspend"
            ? t("suspendTitle", language)
            : confirmAction?.type === "archive"
            ? t("archiveTitle", language)
            : confirmAction?.type === "delete"
            ? t("deleteTitle", language)
            : t("activateTitle", language)
        }
        size="sm"
      >
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          {confirmAction?.type === "suspend" && t("suspendConfirm", language)}
          {confirmAction?.type === "activate" && t("activateConfirm", language)}
          {confirmAction?.type === "archive" && t("archiveConfirm", language)}
          {confirmAction?.type === "delete" && t("deleteConfirm", language)}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmAction(null)}>
            {t("cancel", language)}
          </Button>
          <Button
            variant={
              confirmAction?.type === "activate" ? "primary" : "danger"
            }
            onClick={
              confirmAction?.type === "suspend"
                ? handleSuspend
                : confirmAction?.type === "activate"
                ? handleActivate
                : confirmAction?.type === "archive"
                ? handleArchive
                : handleDelete
            }
          >
            {confirmAction?.type === "suspend"
              ? t("suspendTenant", language)
              : confirmAction?.type === "activate"
              ? t("activateTenant", language)
              : confirmAction?.type === "archive"
              ? t("archiveTenant", language)
              : t("deleteTenant", language)}
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
