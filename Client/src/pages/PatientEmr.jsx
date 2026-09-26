import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';

import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import TabList from '../components/ui/TabList';
import TabPanel from '../components/ui/TabPanel';
import ChartTab from '../features/emr/ChartTab';
import TreatmentPlansTab from '../features/emr/TreatmentPlansTab';
import PrescriptionsTab from '../features/emr/PrescriptionsTab';
import ClinicalTimelineTab from '../features/emr/ClinicalTimelineTab';
import WalletTab from '../features/wallet/WalletTab';
import ClinicalContextBar from '../features/emr/ClinicalContextBar';
import { resetWallet } from '../features/wallet/walletSlice';
import { setEmrPatient, resetEmr } from '../features/emr/emrSlice';
import { patientApi } from '../features/patients/patientApi';
import { useCanViewEmr } from '../lib/roles';
import { useT } from '../lib/i18n';
import { useTabIds } from '../lib/tabs';

const TABS = [
  { key: 'chart', labelKey: 'emr.tab.chart' },
  { key: 'plans', labelKey: 'emr.tab.plans' },
  { key: 'prescriptions', labelKey: 'emr.tab.prescriptions' },
  { key: 'timeline', labelKey: 'emr.tab.timeline' },
  { key: 'wallet', labelKey: 'emr.tab.wallet' },
];

export default function PatientEmr() {
  const { id: patientId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const [patient, setPatient] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('chart');
  const tabIds = useTabIds();
  // Resolved unconditionally at the top of the component: this is a hook, so
  // it must not sit behind the early return below.
  const canOpenEmr = useCanViewEmr();
  useEffect(() => {
    dispatch(setEmrPatient(patientId));
    return () => {
      dispatch(resetEmr());
      dispatch(resetWallet());
    };
  }, [dispatch, patientId]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    patientApi
      .get(patientId)
      .then(({ patient: p }) => {
        if (active) {
          setPatient(p);
          setStatus('succeeded');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || 'Failed to load patient');
          setStatus('failed');
        }
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  if (!canOpenEmr) {
    return (
      <EmptyState title={t('error.notAllowed')} message={t('error.notAllowedMsg')} />
    );
  }

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label={t('common.close')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('emr.title')}</h1>
          {patient ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {patient.fullName} · <span className="font-mono text-xs">{patient.patientId}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">{t('emr.loading')}</p>
          )}
        </div>
      </div>

      {!isLoading && !error && patient && <ClinicalContextBar patient={patient} />}

      <TabList
        tabs={TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))}
        active={tab}
        onChange={setTab}
        label={t('emr.title')}
        ids={tabIds}
      />


      {isLoading && <Spinner label={t('emr.loading')} />}
      {error && !isLoading && <EmptyState title={t('error.notFound')} message={error} />}
      {!isLoading && !error && patient && (
        <TabPanel tabIds={tabIds} tabKey={tab}>
          {tab === 'chart' && <ChartTab patientId={patientId} />}
          {tab === 'plans' && <TreatmentPlansTab patientId={patientId} />}
          {tab === 'prescriptions' && <PrescriptionsTab patientId={patientId} patient={patient} />}
          {tab === 'timeline' && <ClinicalTimelineTab patientId={patientId} patient={patient} />}
          {tab === 'wallet' && <WalletTab patientId={patientId} />}
        </TabPanel>
      )}

    </div>
  );
}
