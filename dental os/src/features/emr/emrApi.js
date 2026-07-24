import api from '../../lib/axios';

const base = (patientId) => `/patients/${patientId}`;

export const emrApi = {
  /* Dental chart */
  getChart: (patientId) => api.get(`${base(patientId)}/dental-chart`).then((r) => r.data.data),
  updateChart: (patientId, payload) =>
    api.patch(`${base(patientId)}/dental-chart`, payload).then((r) => r.data.data),
  updateTooth: (patientId, number, payload) =>
    api.patch(`${base(patientId)}/dental-chart/teeth/${number}`, payload).then((r) => r.data.data),

  /* Treatment plans */
  listPlans: (patientId, params) =>
    api.get(`${base(patientId)}/treatment-plans`, { params }).then((r) => r.data.data),
  getPlan: (patientId, planId) =>
    api.get(`${base(patientId)}/treatment-plans/${planId}`).then((r) => r.data.data),
  createPlan: (patientId, payload) =>
    api.post(`${base(patientId)}/treatment-plans`, payload).then((r) => r.data.data),
  updatePlan: (patientId, planId, payload) =>
    api.patch(`${base(patientId)}/treatment-plans/${planId}`, payload).then((r) => r.data.data),
  archivePlan: (patientId, planId) =>
    api.delete(`${base(patientId)}/treatment-plans/${planId}`).then((r) => r.data.data),
  addItem: (patientId, planId, payload) =>
    api.post(`${base(patientId)}/treatment-plans/${planId}/items`, payload).then((r) => r.data.data),
  updateItem: (patientId, planId, itemId, payload) =>
    api
      .patch(`${base(patientId)}/treatment-plans/${planId}/items/${itemId}`, payload)
      .then((r) => r.data.data),
  removeItem: (patientId, planId, itemId) =>
    api
      .delete(`${base(patientId)}/treatment-plans/${planId}/items/${itemId}`)
      .then((r) => r.data.data),

  /* Prescriptions */
  listPrescriptions: (patientId, params) =>
    api.get(`${base(patientId)}/prescriptions`, { params }).then((r) => r.data.data),
  getPrescription: (patientId, rxId) =>
    api.get(`${base(patientId)}/prescriptions/${rxId}`).then((r) => r.data.data),
  createPrescription: (patientId, payload) =>
    api.post(`${base(patientId)}/prescriptions`, payload).then((r) => r.data.data),
  updatePrescription: (patientId, rxId, payload) =>
    api.patch(`${base(patientId)}/prescriptions/${rxId}`, payload).then((r) => r.data.data),
  deletePrescription: (patientId, rxId) =>
    api.delete(`${base(patientId)}/prescriptions/${rxId}`).then((r) => r.data.data),

  /* Clinical notes (timeline) */
  listNotes: (patientId, params) =>
    api.get(`${base(patientId)}/clinical-notes`, { params }).then((r) => r.data.data),
  getNote: (patientId, noteId) =>
    api.get(`${base(patientId)}/clinical-notes/${noteId}`).then((r) => r.data.data),
  createNote: (patientId, payload) =>
    api.post(`${base(patientId)}/clinical-notes`, payload).then((r) => r.data.data),
  updateNote: (patientId, noteId, payload) =>
    api.patch(`${base(patientId)}/clinical-notes/${noteId}`, payload).then((r) => r.data.data),
  deleteNote: (patientId, noteId) =>
    api.delete(`${base(patientId)}/clinical-notes/${noteId}`).then((r) => r.data.data),

  /* Encrypted file attachments */
  uploadFile: (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/emr/attachments/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }).then((r) => r.data.data);
  },
  getDownloadUrl: (filename) => `/api/v1/emr/attachments/${filename}/download`,
};
