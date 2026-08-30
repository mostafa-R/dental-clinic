import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { fetchMatrix } from './rolesSlice';
import { CRUD_ACTIONS, CRUD_SHORT, MODULES as LOCAL_MODULES } from './permissions';
import { useT } from '../../lib/i18n';

export default function MatrixView() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { matrix, matrixStatus, matrixError, modules: serverModules } = useSelector((s) => s.roles);

  useEffect(() => {
    dispatch(fetchMatrix());
  }, [dispatch]);

  const MODULES = matrix?.modules || serverModules?.modules || LOCAL_MODULES;
  const rolesList = matrix?.roles || [];

  if (matrixStatus === 'loading' || matrixStatus === 'idle') {
    return <Spinner label={t('roles.loading')} />;
  }
  if (matrixStatus === 'failed') {
    return <EmptyState title={t('roles.loadFailed')} message={matrixError?.message} />;
  }

  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <th className="px-4 py-2 text-left">{t('roles.col.module')}</th>
              {rolesList.map((role) => (
                <th key={role.key || role.id} className="px-3 py-2 text-center">
                  <div className="font-medium text-slate-600 dark:text-slate-300">{role.name}</div>
                  {role.isSystemAdmin && (
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">{t('roles.admin')}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {MODULES.map((mod) => (
              <tr key={mod.key}>
                <td className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">{t('mod.' + mod.key)}</td>
                {rolesList.map((role) => {
                  const cell = matrix?.matrix?.[mod.key]?.[role.key || role.id];
                  const actions = role.isSystemAdmin || cell?.isSystemAdmin ? CRUD_ACTIONS : cell?.actions || [];
                  return (
                    <td key={role.key || role.id} className="px-3 py-2 text-center">
                      {actions.length === 0 ? (
                        <span className="text-slate-200 dark:text-slate-700">—</span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center justify-center gap-0.5">
                          {CRUD_ACTIONS.map((a) =>
                            actions.includes(a) ? (
                              <span
                                key={a}
                                title={a}
                                className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${
                                  a === 'create'
                                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                                    : a === 'read'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                      : a === 'update'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                }`}
                              >
                                {CRUD_SHORT[a]}
                              </span>
                            ) : null,
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {CRUD_ACTIONS.map((a) => (
          <span key={a} className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {CRUD_SHORT[a]}
            </span>
            {t(`modAction.${a}`)}
          </span>
        ))}
      </div>
    </Card>
  );
}