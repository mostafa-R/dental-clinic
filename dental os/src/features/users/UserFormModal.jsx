import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import PasswordInput from '../../components/ui/PasswordInput';
import { createUser, updateUser, resetFormState } from './userSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { fetchBranches } from '../branches/branchSlice';
import { fetchRoles } from '../roles/rolesSlice';
import { useT } from '../../lib/i18n';

export default function UserFormModal({ open, onClose, user }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.users.formStatus);
  const branches = useSelector((s) => s.branches.items);
  const roles = useSelector((s) => s.roles.items);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [roleId, setRoleId] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDoctor, setIsDoctor] = useState(false);
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    if (!open) {
      setCredentials(null);
      dispatch(resetFormState());
      return;
    }
    dispatch(fetchBranches());
    dispatch(fetchRoles());
  }, [open, dispatch]);

  useEffect(() => {
    if (!open) return;
    setCredentials(null);
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPassword('');
      setRole(user.role || '');
      setRoleId(user.roleId?._id || user.roleId || '');
      setPhone(user.phone || '');
      setBranch(user.branch?._id || user.branch || '');
      setIsActive(user.isActive ?? true);
      setIsDoctor(user.isDoctor ?? false);
    } else {
      const firstRole = roles.find((r) => !r.isSystemAdmin);
      setName('');
      setEmail('');
      setPassword('');
      setRole(firstRole?.key || (firstRole?.name ?? 'receptionist'));
      setRoleId(firstRole?._id || '');
      setPhone('');
      setBranch('');
      setIsActive(true);
      setIsDoctor(false);
    }
  }, [open, user, roles]);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    if (!user && !password) return;

    const payload = {
      name: name.trim(),
      email: email.trim(),
      role,
      phone: phone.trim(),
      branch,
      isActive,
      isDoctor,
    };
    if (password) payload.password = password;
    if (roleId) payload.roleId = roleId;

    try {
      if (user) {
        await dispatch(updateUser({ id: user._id, payload })).unwrap();
        onClose();
      } else {
        const result = await dispatch(createUser(payload)).unwrap();
        setCredentials({ email: result.user.email, password });
      }
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  const selectCls = inputCls;

  if (credentials) {
    return (
      <Modal open={open} title={t('users.form.credentialsTitle') || 'Staff Created'} onClose={onClose} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('users.form.credentialsMsg') || 'Share these credentials with the staff member:'}</p>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-20 text-sm font-medium text-slate-600 dark:text-slate-300">{t('users.form.email') || 'Email'}:</span>
                <code className="flex-1 rounded bg-white px-2 py-1 text-sm font-mono text-slate-900 dark:bg-slate-800 dark:text-white">{credentials.email}</code>
                <button type="button" onClick={() => copyToClipboard(credentials.email)} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">{t('common.copy') || 'Copy'}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-sm font-medium text-slate-600 dark:text-slate-300">{t('users.form.password') || 'Password'}:</span>
                <code className="flex-1 rounded bg-white px-2 py-1 text-sm font-mono text-slate-900 dark:bg-slate-800 dark:text-white">{credentials.password}</code>
                <button type="button" onClick={() => copyToClipboard(credentials.password)} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">{t('common.copy') || 'Copy'}</button>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{t('users.form.credentialsWarning') || 'This password is shown only once. Save it now.'}</p>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => { setCredentials(null); onClose(); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('common.done') || 'Done'}</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={user ? t('users.form.edit') : t('users.form.new')}
      onClose={onClose}
      size="lg"
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.name')} *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.email')} *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.password')} *{user && ` (${t('users.form.leaveBlank') || 'leave blank to keep'})`}</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder={user ? (t('users.form.keepCurrent') || 'Keep current') : (t('users.form.minChars') || 'Min 8 chars')}
              required={!user}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.phone')}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.role')} *</label>
            <select value={roleId || role} onChange={(e) => {
              const val = e.target.value;
              const matched = roles.find((r) => r._id === val || r.key === val);
              if (matched) {
                setRoleId(matched._id);
                setRole(matched.key || matched.name);
              } else {
                setRoleId('');
                setRole(val);
              }
            }} className={selectCls}>
              <option value="">{t('users.form.selectRole')}</option>
              {roles.filter((r) => !r.isSystemAdmin).map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('users.form.branch')} *</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={selectCls}>
              <option value="">{t('users.form.selectBranch')}</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="userIsActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="userIsActive" className="text-sm text-slate-600 dark:text-slate-300">{t('users.form.active')}</label>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="userIsDoctor" checked={isDoctor} onChange={(e) => setIsDoctor(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="userIsDoctor" className="text-sm text-slate-600 dark:text-slate-300">{t('users.form.doctor')}</label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
