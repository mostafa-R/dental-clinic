import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import { PageLoader } from "../components/ui/Spinner";
import {
  CheckIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "../components/ui/icons";
import {
  createPlan,
  deletePlan,
  fetchPlans,
  updatePlan,
} from "../features/plans/plansSlice";
import { formatCurrency } from "../lib/format";
import { t } from "../lib/i18n";

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "patients", label: "Patients" },
  { key: "appointments", label: "Appointments" },
  { key: "billing", label: "Billing & Invoices" },
  { key: "accounting", label: "Accounting & Finance" },
  { key: "inventory", label: "Inventory" },
  { key: "emr", label: "Medical Records (EMR)" },
  { key: "prescriptions", label: "Prescriptions" },
  { key: "users", label: "Staff & Users" },
  { key: "branches", label: "Branches" },
  { key: "settings", label: "Settings" },
  { key: "roles", label: "Roles & Permissions" },
];

export default function Plans() {
  const dispatch = useDispatch();
  const { items, loading } = useSelector((state) => state.plans);
  const { language } = useSelector((state) => state.ui);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    interval: "month",
    modules: ["dashboard", "patients", "appointments", "billing"],
    maxBranches: 1,
    maxDoctors: 3,
    maxPatients: 500,
    storage: "5GB",
    support: "Email",
    features: [],
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [newFeature, setNewFeature] = useState("");

  useEffect(() => {
    dispatch(fetchPlans());
  }, [dispatch]);

  const resetForm = () => {
    setFormData({
      name: "",
      price: 0,
      interval: "month",
      modules: ["dashboard", "patients", "appointments", "billing"],
      maxBranches: 1,
      maxDoctors: 3,
      maxPatients: 500,
      storage: "5GB",
      support: "Email",
      features: [],
      isActive: true,
    });
    setFormErrors({});
    setSelectedPlan(null);
    setNewFeature("");
  };

  const handleEdit = (plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      price: plan.price,
      interval: plan.interval || "month",
      modules: plan.modules || ["dashboard", "patients", "appointments", "billing"],
      maxBranches: plan.limits?.maxBranches || 1,
      maxDoctors: plan.limits?.maxDoctors || 3,
      maxPatients: plan.limits?.maxPatients || 500,
      storage: plan.limits?.storage || "5GB",
      support: plan.support || "Email",
      features: plan.features || [],
      isActive: plan.isActive ?? true,
    });
    setShowForm(true);
  };

  const handleAddFeature = () => {
    if (newFeature.trim()) {
      setFormData({
        ...formData,
        features: [...formData.features, newFeature.trim()],
      });
      setNewFeature("");
    }
  };

  const handleRemoveFeature = (index) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index),
    });
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Name is required";
    if (formData.price < 0) errors.price = "Price must be positive";
    if (formData.maxBranches < 0) errors.maxBranches = "Invalid value";
    if (formData.maxDoctors < 0) errors.maxDoctors = "Invalid value";
    if (formData.maxPatients < 0) errors.maxPatients = "Invalid value";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const planData = {
      name: formData.name,
      price: formData.price,
      interval: formData.interval,
      modules: formData.modules,
      limits: {
        maxBranches: formData.maxBranches,
        maxDoctors: formData.maxDoctors,
        maxPatients: formData.maxPatients,
        storage: formData.storage,
      },
      support: formData.support,
      features: formData.features,
      isActive: formData.isActive,
    };

    try {
      if (selectedPlan) {
        await dispatch(updatePlan({ id: selectedPlan._id, data: planData }));
      } else {
        await dispatch(createPlan(planData));
      }
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error("Failed to save plan:", error);
    }
  };

  const handleDelete = async () => {
    await dispatch(deletePlan(deleteConfirm._id));
    setDeleteConfirm(null);
  };

  if (loading && !items.length) {
    return (
      <AppLayout>
        <Topbar title={t("plans", language)} />
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar title={t("plans", language)} />
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Subscription Plans
          </h2>
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="w-4 h-4" />
            {t("addPlan", language)}
          </Button>
        </div>

        {/* Plans Grid */}
        {items.length === 0 ? (
          <EmptyState
            title="No plans found"
            description="Create subscription plans for your platform."
            icon={Squares2X2Icon}
            action={
              <Button onClick={() => setShowForm(true)}>
                <PlusIcon className="w-4 h-4" />
                {t("addPlan", language)}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((plan) => (
              <Card key={plan._id} className="relative">
                {!plan.isActive && (
                  <div className="absolute top-4 end-4">
                    <Badge variant="warning">Inactive</Badge>
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {plan.name}
                  </h3>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-slate-900 dark:text-white">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      /{plan.interval || "month"}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("maxBranches", language)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.limits?.maxBranches || "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("maxDoctors", language)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.limits?.maxDoctors || "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("maxPatients", language)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.limits?.maxPatients || "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("storage", language)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.limits?.storage || "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("support", language)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.support}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      Modules
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {plan.modules?.length || 0}/12
                    </span>
                  </div>
                </div>

                {/* Features */}
                {plan.features?.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mb-6">
                    <ul className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                        >
                          <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => handleEdit(plan)}
                  >
                    {t("edit", language)}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteConfirm(plan)}
                  >
                    {t("delete", language)}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Plan Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={selectedPlan ? t("editPlan", language) : t("addPlan", language)}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("planName", language)}
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
                placeholder="e.g., Starter, Professional, Enterprise"
              />
              {formErrors.name && (
                <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("planPrice", language)}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={`flex-1 px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                    formErrors.price
                      ? "border-red-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                />
                <select
                  value={formData.interval}
                  onChange={(e) =>
                    setFormData({ ...formData, interval: e.target.value })
                  }
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("maxBranches", language)}
              </label>
              <input
                type="number"
                value={formData.maxBranches}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxBranches: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0 for unlimited"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("maxDoctors", language)}
              </label>
              <input
                type="number"
                value={formData.maxDoctors}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxDoctors: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0 for unlimited"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("maxPatients", language)}
              </label>
              <input
                type="number"
                value={formData.maxPatients}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxPatients: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0 for unlimited"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("storage", language)}
              </label>
              <input
                type="text"
                value={formData.storage}
                onChange={(e) =>
                  setFormData({ ...formData, storage: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g., 5GB, Unlimited"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("support", language)}
              </label>
              <input
                type="text"
                value={formData.support}
                onChange={(e) =>
                  setFormData({ ...formData, support: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g., Email, Priority Email + Chat"
              />
            </div>
          </div>

          {/* Modules */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Modules (App Access)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {ALL_MODULES.map((mod) => (
                <label
                  key={mod.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                    formData.modules.includes(mod.key)
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.modules.includes(mod.key)}
                    onChange={() => {
                      setFormData({
                        ...formData,
                        modules: formData.modules.includes(mod.key)
                          ? formData.modules.filter((k) => k !== mod.key)
                          : [...formData.modules, mod.key],
                      });
                    }}
                    className="sr-only"
                  />
                  {mod.label}
                </label>
              ))}
            </div>
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("planFeatures", language)}
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddFeature())
                }
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Add a feature"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddFeature}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.features.map((feature, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-sm text-slate-700 dark:text-slate-300"
                >
                  {feature}
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(index)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData({ ...formData, isActive: e.target.checked })
              }
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="isActive"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Active (available for new subscriptions)
            </label>
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={`Delete Plan`}
        size="sm"
      >
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Are you sure you want to delete the{" "}
          <strong>{deleteConfirm?.name}</strong> plan? This action cannot be
          undone.
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
