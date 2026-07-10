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
import PasswordInput from "../components/ui/PasswordInput";
import { PageLoader } from "../components/ui/Spinner";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "../components/ui/icons";
import {
  createAdmin,
  deleteAdmin,
  fetchAdmins,
  setPage,
  updateAdmin,
} from "../features/admins/adminsSlice";
import { formatDate } from "../lib/format";
import { t } from "../lib/i18n";
import { ROLE_PERMISSIONS, SITE_PERMISSIONS } from "../lib/permissions";

const AVAILABLE_ROLES = ["super_admin", "admin", "support"];

export default function Admins() {
  const dispatch = useDispatch();
  const { items, loading, pagination, filters } = useSelector(
    (state) => state.admins,
  );
  const { language } = useSelector((state) => state.ui);
  const [search, setSearch] = useState(filters.search || "");
  const [roleFilter, setRoleFilter] = useState(filters.role || "");
  const [showForm, setShowForm] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "support",
    permissions: [],
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    dispatch(fetchAdmins({ page: pagination.page, ...filters }));
  }, [dispatch, pagination.page, filters]);

  const handleSearch = () => {
    dispatch(setPage(1));
    dispatch(fetchAdmins({ page: 1, search, role: roleFilter }));
  };

  const handlePageChange = (page) => {
    dispatch(setPage(page));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "support",
      permissions: [],
    });
    setFormErrors({});
    setSelectedAdmin(null);
    setCredentials(null);
  };

  const handleEdit = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      name: admin.name,
      email: admin.email,
      password: "",
      role: admin.role,
      permissions: admin.permissions || [],
    });
    setShowForm(true);
  };

  const handleRoleChange = (role) => {
    const permissions = ROLE_PERMISSIONS[role]?.permissions || [];
    setFormData({ ...formData, role, permissions });
  };

  const handlePermissionToggle = (permission) => {
    const newPermissions = formData.permissions.includes(permission)
      ? formData.permissions.filter((p) => p !== permission)
      : [...formData.permissions, permission];
    setFormData({ ...formData, permissions: newPermissions });
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    if (!selectedAdmin && !formData.password)
      errors.password = "Password is required";
    if (formData.permissions.length === 0)
      errors.permissions = "At least one permission is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      if (selectedAdmin) {
        const updateData = { ...formData };
        if (!updateData.password) delete updateData.password;
        await dispatch(
          updateAdmin({ id: selectedAdmin._id, data: updateData }),
        );
        setShowForm(false);
        resetForm();
      } else {
        const result = await dispatch(createAdmin(formData)).unwrap();
        setCredentials({ email: result.admin.email, password: formData.password });
      }
    } catch (error) {
      console.error("Failed to save admin:", error);
    }
  };

  const handleDelete = async () => {
    await dispatch(deleteAdmin(deleteConfirm._id));
    setDeleteConfirm(null);
  };

  const getRoleBadge = (role) => {
    const variants = {
      super_admin: "danger",
      admin: "primary",
      support: "info",
    };
    return (
      <Badge variant={variants[role] || "default"}>
        {role.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  if (loading && !items.length) {
    return (
      <AppLayout>
        <Topbar title={t("admins", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("admins", language)} />
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder={`${t("search", language)}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="ps-10 pe-4 py-2 w-full sm:w-64 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{t("filter", language)}</option>
              {AVAILABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={handleSearch}>
              {t("search", language)}
            </Button>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="w-4 h-4" />
            {t("addAdmin", language)}
          </Button>
        </div>

        {/* Admins Table */}
        <Card padding="p-0">
          {items.length === 0 ? (
            <EmptyState
              title="No admins found"
              description="Add site administrators to manage the platform."
              icon={ShieldCheckIcon}
              action={
                <Button onClick={() => setShowForm(true)}>
                  <PlusIcon className="w-4 h-4" />
                  {t("addAdmin", language)}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("adminName", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("adminRole", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("adminPermissions", language)}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("lastActive", language)}
                    </th>
                    <th className="px-6 py-3 text-end text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t("actions", language)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {items.map((admin) => (
                    <tr
                      key={admin._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              {admin.name?.charAt(0) || "A"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {admin.name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {admin.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(admin.role)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {admin.permissions?.slice(0, 3).map((perm) => (
                            <span
                              key={perm}
                              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                            >
                              {perm.split(":")[0]}
                            </span>
                          ))}
                          {admin.permissions?.length > 3 && (
                            <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                              +{admin.permissions.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatDate(admin.lastActive || admin.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-end">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(admin)}
                          >
                            {t("edit", language)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirm(admin)}
                          >
                            {t("delete", language)}
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

      {/* Admin Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={
          selectedAdmin ? t("editAdmin", language) : t("addAdmin", language)
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("adminName", language)}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                  formErrors.name
                    ? "border-red-500"
                    : "border-slate-300 dark:border-slate-600"
                }`}
              />
              {formErrors.name && (
                <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("adminEmail", language)}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                  formErrors.email
                    ? "border-red-500"
                    : "border-slate-300 dark:border-slate-600"
                }`}
              />
              {formErrors.email && (
                <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password {selectedAdmin ? "(leave blank to keep current)" : "*"}
              </label>
              <PasswordInput
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required={!selectedAdmin}
                placeholder={selectedAdmin ? "Keep current" : "Min 8 chars"}
                className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                  formErrors.password
                    ? "border-red-500"
                    : "border-slate-300 dark:border-slate-600"
                }`}
              />
              {formErrors.password && (
                <p className="text-red-500 text-sm mt-1">
                  {formErrors.password}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("adminRole", language)}
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {AVAILABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replace("_", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("adminPermissions", language)}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
              {Object.values(SITE_PERMISSIONS).map((permission) => (
                <label
                  key={permission}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(permission)}
                    onChange={() => handlePermissionToggle(permission)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {permission}
                  </span>
                </label>
              ))}
            </div>
            {formErrors.permissions && (
              <p className="text-red-500 text-sm mt-1">
                {formErrors.permissions}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              {t("cancel", language)}
            </Button>
            <Button type="submit">{t("save", language)}</Button>
          </div>
        </form>
      </Modal>

      {/* Credentials Display Modal */}
      <Modal
        isOpen={!!credentials}
        onClose={() => setCredentials(null)}
        title="Admin Created"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Share these credentials with the admin:
          </p>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-20 text-sm font-medium text-slate-600 dark:text-slate-300">Email:</span>
                <code className="flex-1 rounded bg-white px-2 py-1 text-sm font-mono text-slate-900 dark:bg-slate-800 dark:text-white">{credentials?.email}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(credentials?.email)} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">Copy</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-sm font-medium text-slate-600 dark:text-slate-300">Password:</span>
                <code className="flex-1 rounded bg-white px-2 py-1 text-sm font-mono text-slate-900 dark:bg-slate-800 dark:text-white">{credentials?.password}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(credentials?.password)} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">Copy</button>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">This password is shown only once. Save it now.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { setCredentials(null); setShowForm(false); resetForm(); }}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={`Delete Admin`}
        size="sm"
      >
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>
          ? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            {t("cancel", language)}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("delete", language)}
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
