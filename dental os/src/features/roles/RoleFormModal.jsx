import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import {
  createRole,
  createRoleFromTemplate,
  resetFormState,
  updateRole,
  fetchModules,
  fetchTemplates,
} from './rolesSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { CRUD_ACTIONS, CRUD_SHORT, MODULES as LOCAL_MODULES } from './permissions';
import { useT } from '../../lib/i18n';

export default function RoleFormModal({ open, onClose, role }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.roles.formStatus);
  const serverModules = useSelector((s) => s.roles.modules);
  const templates = useSelector((s) => s.roles.templates);

  const MODULES = serverModules?.modules || LOCAL_MODULES;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateRoleId, setTemplateRoleId] = useState('');
  // permissions: { [moduleKey]: Set<action> }
  const [perms, setPerms] = useState({});

  useEffect(() => {
    if (!open) return;
    dispatch(resetFormState());
    dispatch(fetchModules());
    if (!role) dispatch(fetchTemplates());
    if (role) {
      setName(role.name);
      setDescription(role.description || '');
      const map = {};
      for (const mod of MODULES) {
        const entry = role.permissions?.find((p) => p.module === mod.key);
        map[mod.key] = new Set(entry?.actions || []);
      }
      setPerms(map);
    } else {
      setName('');
      setDescription('');
      setTemplateRoleId('');
      const map = {};
      for (const mod of MODULES) map[mod.key] = new Set();
      setPerms(map);
    }
  }, [open, role, dispatch]);

  const templateOptions = [];
  const allTemplates = templates || { defaultRoles: [], builtInRoles: [], customRoles: [] };
  if (!role) {
    (allTemplates.defaultRoles || []).forEach((tmpl) => {
      // Default templates carry a key, not a database id; only built-in and
      // custom roles (which have an id) can be passed as baseRoleId.
      if (tmpl.id) templateOptions.push({ id: tmpl.id, name: tmpl.name, group: t('roles.template.default') });
    });
    (allTemplates.builtInRoles || []).forEach((tmpl) =>
      templateOptions.push({ id: tmpl.id, name: tmpl.name, group: t('roles.template.builtIn') }),
    );
    (allTemplates.customRoles || []).forEach((tmpl) =>
      templateOptions.push({ id: tmpl.id, name: tmpl.name, group: t('roles.template.custom') }),
    );
  }

  const usesTemplate = !role && Boolean(templateRoleId);

  const toggleAction = (moduleKey, action) => {
    setPerms((prev) => {
      const next = { ...prev };
      const set = new Set(next[moduleKey] || []);
      if (set.has(action)) set.delete(action);
      else set.add(action);
      next[moduleKey] = set;
      return next;
    });
  };

  const toggleAll = (moduleKey) => {
    setPerms((prev) => {
      const next = { ...prev };
      const set = new Set(next[moduleKey] || []);
      if (set.size === CRUD_ACTIONS.length) {
        next[moduleKey] = new Set();
      } else {
        next[moduleKey] = new Set(CRUD_ACTIONS);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      dispatch(showErrorDialog({ message: t('roles.needName') }));
      return;
    }
    const permissions = MODULES.filter((m) => perms[m.key]?.size > 0).map((m) => ({
      module: m.key,
      actions: Array.from(perms[m.key]),
    }));

    try {
      if (role) {
        await dispatch(updateRole({ id: role._id, payload: { name: name.trim(), description: description.trim(), permissions } })).unwrap();
      } else if (usesTemplate) {
        await dispatch(createRoleFromTemplate({ name: name.trim(), description: description.trim(), baseRoleId: templateRoleId })).unwrap();
      } else {
        await dispatch(createRole({ name: name.trim(), description: description.trim(), permissions })).unwrap();
      }
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  const isBuiltIn = role?.isBuiltIn;

  return (
    <Modal
      open={open}
      title={role ? t('roles.form.edit') : t('roles.form.new')}
      onClose={onClose}
      size="xl"
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('roles.form.name')} *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isBuiltIn} className={`${inputCls} ${isBuiltIn ? 'opacity-60' : ''}`} maxLength={60} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('roles.form.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} maxLength={300} />
          </div>
        </div>

        {role?.isSystemAdmin && (
          <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {t('roles.systemAdminNote')}
          </div>
        )}

        {!role && templateOptions.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('roles.template.label')}
            </label>
            <select
              value={templateRoleId}
              onChange={(e) => setTemplateRoleId(e.target.value)}
              className={inputCls}
            >
              <option value="">{t('roles.template.none')}</option>
              {templateOptions.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name} · {tmpl.group}
                </option>
              ))}
            </select>
            {usesTemplate && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{t('roles.template.note')}</p>
            )}
          </div>
        )}

        {/* Permission Matrix */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('roles.form.permissions')}</label>
          <div className={`overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 ${usesTemplate ? 'opacity-50' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('roles.col.module')}</th>
                  {CRUD_ACTIONS.map((a) => (
                    <th key={a} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{CRUD_SHORT[a]}</th>
                  ))}
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('roles.col.all')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {MODULES.map((mod) => (
                  <tr key={mod.key}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{t('mod.' + mod.key)}</td>
                    {CRUD_ACTIONS.map((a) => {
                      const checked = perms[mod.key]?.has(a);
                      return (
                        <td key={a} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked || false}
                            onChange={() => toggleAction(mod.key, a)}
                            disabled={role?.isSystemAdmin || usesTemplate}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleAll(mod.key)}
                        disabled={role?.isSystemAdmin || usesTemplate}
                        className="text-xs font-medium text-indigo-600 transition hover:text-indigo-800 disabled:opacity-40 dark:text-indigo-400"
                      >
                        {perms[mod.key]?.size === CRUD_ACTIONS.length ? t('roles.clear') : t('roles.selectAll')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
