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
import BranchFormModal from "../features/branches/BranchFormModal";
import {
  deleteBranch,
  fetchBranches,
  setPage,
} from "../features/branches/branchesSlice";
import { fetchTenants } from "../features/tenants/tenantsSlice";
import { formatDate } from "../lib/format";
import { t } from "../lib/i18n";

export default function Branches() {
  const dispatch = useDispatch();
  const { items, loading, pagination, filters } = useSelector(
    (state) => state.branches,
  );
  const { items: tenants } = useSelector((state) => state.tenants);
  const { language } = useSelector((state) => state.ui);
  const [search, setSearch] = useState(filters.search || "");
  const [tenantFilter, setTenantFilter] = useState(filters.tenant || "");
  const [showForm, setShowForm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    dispatch(fetchBranches({ page: pagination.page, ...filters }));
    if (!tenants.length) dispatch(fetchTenants({ limit: 100 }));
  }, [dispatch, pagination.page, filters]);

  const tenantName = (id) => {
    const t = tenants.find((tn) => tn._id === id);
    return t?.name || id;
  };

  const handleSearch = () => {
    dispatch(setPage(1));
    dispatch(fetchBranches({ page: 1, search, tenant: tenantFilter }));
  };

  const handlePageChange = (page) => {
    dispatch(setPage(page));
  };

  const handleDelete = async () => {
    await dispatch(deleteBranch(deleteTarget._id));
    setDeleteTarget(null);
  };

  if (loading && !items.length) {
    return (
      <AppLayout>
        <Topbar title={t("branches", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("branches", language)} />
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder={t("searchBranches", language)}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="ps-10 pe-4 py-2 w-full sm:w-64 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{t("all", language)}</option>
              {tenants.map((tn) => (
                <option key={tn._id} value={tn._id}>
                  {tn.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={handleSearch}>
              {t("search", language)}
            </Button>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="w-4 h-4" />
            {t("addBranch", language)}
          </Button>
        </div>

        <Card padding="p-0">
          {items.length === 0 ? (
            <EmptyState
              title={t("noBranchesFound", language)}
              description={t("noBranchesDesc", language)}
              icon={BuildingOfficeIcon}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("branchName", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("branchTenant", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("branchUsers", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("branchAddress", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("status", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("branchCreated", language)}
                    </th>
                    <th className="px-6 py-3 text-end text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("actions", language)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {items.map((branch) => (
                    <tr
                      key={branch._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {branch.name}
                        </p>
                        {branch.phone && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {branch.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {branch.tenant?.name || tenantName(branch.tenant)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {branch.usersCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300 max-w-48 truncate">
                        {branch.address || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={branch.isActive ? "success" : "default"}
                        >
                          {branch.isActive
                            ? t("branchActive", language)
                            : t("branchInactive", language)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatDate(branch.createdAt, language)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-end">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedBranch(branch);
                              setShowForm(true);
                            }}
                          >
                            {t("edit", language)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteTarget(branch)}
                          >
                            {t("deleteBranch", language)}
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

      <BranchFormModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedBranch(null);
        }}
        branch={selectedBranch}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("deleteBranch", language)}
        size="sm"
      >
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          {t("deleteBranchConfirm", language)}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t("cancel", language)}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("deleteBranch", language)}
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
