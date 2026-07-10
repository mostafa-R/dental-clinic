import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { createBranch, updateBranch } from "./branchesSlice";
import { fetchTenants } from "../tenants/tenantsSlice";
import { t } from "../../lib/i18n";

export default function BranchFormModal({ isOpen, onClose, branch }) {
  const dispatch = useDispatch();
  const { language } = useSelector((state) => state.ui);
  const { items: tenants } = useSelector((state) => state.tenants);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    tenant: "",
    name: "",
    address: "",
    phone: "",
  });

  useEffect(() => {
    if (isOpen && !tenants.length) {
      dispatch(fetchTenants({ limit: 100 }));
    }
  }, [isOpen, tenants.length, dispatch]);

  useEffect(() => {
    if (branch) {
      setFormData({
        tenant: branch.tenant?._id || branch.tenant || "",
        name: branch.name || "",
        address: branch.address || "",
        phone: branch.phone || "",
      });
    } else {
      setFormData({
        tenant: tenants.length > 0 ? tenants[0]._id : "",
        name: "",
        address: "",
        phone: "",
      });
    }
  }, [branch, isOpen]);

  // Reset to default tenant when tenants load and no branch is selected
  useEffect(() => {
    if (!branch && tenants.length > 0 && !formData.tenant) {
      setFormData((prev) => ({ ...prev, tenant: tenants[0]._id }));
    }
  }, [tenants, branch, formData.tenant]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (!branch && !formData.tenant) return;

    setLoading(true);
    try {
      if (branch) {
        const result = await dispatch(
          updateBranch({ id: branch._id, data: formData }),
        );
        if (result.error) {
          alert(result.payload || "Failed to update branch");
        } else {
          onClose();
        }
      } else {
        const result = await dispatch(createBranch(formData));
        if (result.error) {
          alert(result.payload || "Failed to create branch");
        } else {
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={branch ? t("editBranch", language) : t("addBranch", language)}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!branch && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("branchTenant", language)} *
            </label>
            <select
              name="tenant"
              value={formData.tenant}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{t("selectTenant", language)}</option>
              {tenants.map((tn) => (
                <option key={tn._id} value={tn._id}>
                  {tn.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t("branchName", language)} *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t("branchAddress", language)}
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t("branchPhone", language)}
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("cancel", language)}
          </Button>
          <Button type="submit" loading={loading}>
            {branch ? t("saveChanges", language) : t("addBranch", language)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}





