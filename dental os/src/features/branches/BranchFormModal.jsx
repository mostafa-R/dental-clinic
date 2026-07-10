import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import { createBranch, updateBranch, resetFormState } from './branchSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

export default function BranchFormModal({ open, onClose, branch }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.branches.formStatus);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    dispatch(resetFormState());
    if (branch) {
      setName(branch.name || '');
      setAddress(branch.address || '');
      setPhone(branch.phone || '');
      setIsActive(branch.isActive ?? true);
    } else {
      setName('');
      setAddress('');
      setPhone('');
      setIsActive(true);
    }
  }, [open, branch, dispatch]);

  const submit = async () => {
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      isActive,
    };

    try {
      if (branch) {
        await dispatch(updateBranch({ id: branch._id, payload })).unwrap();
      } else {
        await dispatch(createBranch(payload)).unwrap();
      }
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <Modal
      open={open}
      title={branch ? t('branches.form.edit') : t('branches.form.new')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={formStatus === 'loading'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.name')} *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.address')}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.phone')}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} maxLength={30} />
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="branchIsActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="branchIsActive" className="text-sm text-slate-600 dark:text-slate-300">{t('branches.form.active')}</label>
        </div>
      </div>
    </Modal>
  );
}
