// EMR feature barrel exports
export { emrApi } from './emrApi';
export {
  fetchChart,
  saveTooth,
  saveChart,
  fetchPlans,
  createPlan,
  updatePlan,
  archivePlan,
  addPlanItem,
  updatePlanItem,
  removePlanItem,
  fetchPrescriptions,
  createPrescription,
  updatePrescription,
  deletePrescription,
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  setEmrPatient,
  resetEmr,
  resetFormState,
} from './emrSlice';
export { default as ChartTab } from './ChartTab';
export { default as ClinicalNoteFormModal } from './ClinicalNoteFormModal';
export { default as ClinicalTimelineTab } from './ClinicalTimelineTab';
export { default as DentalChart } from './DentalChart';
export { default as PrescriptionFormModal } from './PrescriptionFormModal';
export { default as PrescriptionsTab } from './PrescriptionsTab';
export { default as ToothPanel } from './ToothPanel';
export { default as TreatmentPlanFormModal } from './TreatmentPlanFormModal';
export { default as TreatmentPlansTab } from './TreatmentPlansTab';