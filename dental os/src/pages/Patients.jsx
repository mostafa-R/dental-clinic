import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { fetchPatients, openDuplicates, resetPatients, setPage } from '../features/patients/patientSlice';
import PatientDetailModal from '../features/patients/PatientDetailModal';
import PatientFormModal from '../features/patients/PatientFormModal';
import PatientSearch from '../features/patients/PatientSearch';
import PatientsTable from '../features/patients/PatientsTable';
import DuplicatesPanel from '../features/patients/DuplicatesPanel';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Spinner from '../components/ui/Spinner';
import { canManagePatients } from '../lib/roles';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';

export default function Patients() {
  const dispatch = useDispatch();
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const { items, pagination, query, status, error } = useSelector((s) => s.patients);
  const canManage = canManagePatients();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const duplicatesOpen = useSelector((s) => s.patients.duplicates.open);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, []);

  useEffect(() => {
    dispatch(fetchPatients(query));
  }, [dispatch, query]);

  useEffect(() => () => dispatch(resetPatients()), [dispatch]);

  const refetch = useCallback(() => { dispatch(fetchPatients(query)); }, [dispatch, query]);
  useSocketEvent('patient:created', refetch);
  useSocketEvent('patient:updated', refetch);
  useSocketEvent('patient:archived', refetch);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (patient) => {
    setEditing(patient);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };
  const onSaved = () => {
    closeForm();
    dispatch(fetchPatients(query));
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('patients.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('patients.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch(openDuplicates())}
            className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            {t('patients.checkDuplicates')}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {t('patients.new')}
            </button>
          )}
        </div>
      </header>

      {duplicatesOpen && <DuplicatesPanel />}

      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <PatientSearch />
        </div>

        {isLoading && (
          <div className="px-5 py-16">
            <Spinner label={t('patients.loading')} />
          </div>
        )}

        {error && !isLoading && (
          <div className="px-5 py-16">
            <EmptyState title={t('patients.loadFailed')} message={error} />
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => dispatch(fetchPatients(query))}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {t('common.tryAgain')}
              </button>
            </div>
          </div>
        )}

        {status === 'succeeded' && !error && (
          <PatientsTable onView={setViewing} onEdit={openEdit} />
        )}

        {status === 'succeeded' && !error && items.length > 0 && (
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            pageSize={pagination.limit}
            onChange={(p) => dispatch(setPage(p))}
            prevLabel={t('common.prev')}
            nextLabel={t('common.next')}
          />
        )}
      </Card>

      <PatientFormModal
        open={formOpen}
        patient={editing}
        onClose={closeForm}
        onSaved={onSaved}
      />
      <PatientDetailModal
        open={Boolean(viewing)}
        patient={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
