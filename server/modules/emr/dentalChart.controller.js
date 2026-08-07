import DentalChart from './dentalChart.model.js';
import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

function emitChart(branchId, chart) {
  const payload = { chart: chart.toJSON ? chart.toJSON() : chart };
  emitToBranch(branchId, 'chart:updated', payload);
}

/**
 * GET /patients/:patientId/dental-chart
 * Returns the patient's chart, creating a fresh sound chart on first access
 * so the doctor never sees an empty/broken chart.
 */
export const getDentalChart = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);

  // Race-free upsert: concurrent first-access GETs can no longer both try to
  // create the chart (which would throw a duplicate-key error on the unique
  // { branch, patient } index). MongoDB retries the upsert on a lost race.
  const chart = await DentalChart.findOneAndUpdate(
    { patient: patient._id, branch: patient.branch },
    { $setOnInsert: { tenant: patient.tenant, updatedBy: req.user._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!chart.populated('patient')) {
    await chart.populate([
      { path: 'patient', select: 'patientId firstName lastName' },
      { path: 'updatedBy', select: 'name' },
    ]);
  }

  const data = req.isImpersonation ? stripPHI(chart.toJSON()) : chart;
  return sendSuccess(res, { chart: data });
});

/**
 * PATCH /patients/:patientId/dental-chart
 * Update chart-level fields (dentition type, notes) or bulk-replace teeth.
 */
export const updateDentalChart = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  const chart = await DentalChart.findOne({ patient: patient._id, branch: patient.branch });
  if (!chart) {
    throw ApiError.notFound('Dental chart not found');
  }

  if (data.dentitionType) chart.dentitionType = data.dentitionType;
  if (data.notes !== undefined) chart.notes = data.notes;
  if (Array.isArray(data.teeth)) {
    // Merge incoming tooth updates by number, preserving untouched teeth.
    const byNumber = new Map(chart.teeth.map((t) => [t.number, t]));
    for (const incoming of data.teeth) {
      if (!Number.isInteger(incoming.number) || incoming.number < 1 || incoming.number > 32) {
        throw ApiError.badRequest(`Invalid tooth number: ${incoming.number}`);
      }
      const existing = byNumber.get(incoming.number);
      if (!existing) continue;
      if (incoming.state) existing.state = incoming.state;
      if (incoming.surfaces) Object.assign(existing.surfaces, incoming.surfaces);
      if (incoming.notes !== undefined) existing.notes = incoming.notes;
      existing.updatedAt = new Date();
      existing.updatedBy = req.user._id;
    }
  }
  chart.updatedBy = req.user._id;

  await chart.save();
  emitChart(patient.branch, chart);

  return sendSuccess(res, { chart: req.isImpersonation ? stripPHI(chart.toJSON()) : chart });
});

/**
 * PATCH /patients/:patientId/dental-chart/teeth/:number
 * Update a single tooth's state, surfaces, and notes. This is the hot path
 * used by the interactive chart: the doctor clicks a tooth and edits it.
 */
export const updateTooth = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const number = Number(req.params.number);
  if (!Number.isInteger(number) || number < 1 || number > 32) {
    throw ApiError.badRequest('Invalid tooth number');
  }

  const data = req.validatedBody;

  const chart = await DentalChart.findOne({ patient: patient._id, branch: patient.branch });
  if (!chart) {
    throw ApiError.notFound('Dental chart not found');
  }

  const tooth = chart.teeth.find((t) => t.number === number);
  if (!tooth) {
    throw ApiError.notFound('Tooth not found in chart');
  }

  if (data.state) tooth.state = data.state;
  if (data.surfaces) Object.assign(tooth.surfaces, data.surfaces);
  if (data.notes !== undefined) tooth.notes = data.notes;
  tooth.updatedAt = new Date();
  tooth.updatedBy = req.user._id;
  chart.updatedBy = req.user._id;

  await chart.save();
  emitChart(patient.branch, chart);

  return sendSuccess(res, { chart: req.isImpersonation ? stripPHI(chart.toJSON()) : chart });
});
