// Patients feature barrel exports
export { patientApi } from './patientApi';
export {
  fetchPatients,
  createPatient,
  updatePatient,
  archivePatient,
  setSearch,
  setPage,
  setStatusFilter,
  resetPatients,
  resetFormState,
} from './patientSlice';
export { default as PatientDetailModal } from './PatientDetailModal';
export { default as PatientFormModal } from './PatientFormModal';
export { default as PatientSearch } from './PatientSearch';
export { default as PatientsTable } from './PatientsTable';