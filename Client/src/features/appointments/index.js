// Appointments feature barrel exports
export { appointmentApi } from './appointmentApi';
export {
  fetchAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  setSearch,
  setPage,
  setStatusFilter,
  setDateFilter,
  setDoctorFilter,
  setBranchFilter,
  resetAppointments,
  resetFormState,
} from './appointmentSlice';
export { default as AppointmentFormModal } from './AppointmentFormModal';
export { default as CalendarView } from './CalendarView';
export { default as LiveQueue } from './LiveQueue';
export { default as QueueCard } from './QueueCard';
export { default as StatusBadge } from './StatusBadge';
export { default as VisitPanel } from './VisitPanel';