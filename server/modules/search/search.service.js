import Patient from '../patients/patient.model.js';
import Appointment from '../appointments/appointment.model.js';
import Invoice from '../billing/invoice.model.js';
import Branch from '../users/branch.model.js';
import User from '../users/user.model.js';
import Role from '../users/role.model.js';
import InventoryItem from '../inventory/inventory.model.js';
import Expense from '../accounting/expense.model.js';
import OwnerDrawing from '../accounting/ownerDrawing.model.js';
import TreatmentPlan from '../emr/treatmentPlan.model.js';
import Prescription from '../emr/prescription.model.js';
import ClinicalNote from '../emr/clinicalNote.model.js';
import Wallet from '../patients/wallet.model.js';
import InstallmentPlan from '../patients/installment.model.js';
import { cacheGet, cacheSet } from '../../utils/cache.js';

const EMPTY_RESULT = {
  patients: [], appointments: [], invoices: [],
  branches: [], users: [], roles: [],
  inventory: [], expenses: [], drawings: [],
  treatmentPlans: [], prescriptions: [], clinicalNotes: [],
  wallets: [], installments: [],
};

function buildSearchCacheKey(branchFilter, query, allowedModules) {
  const sorted = Object.keys(branchFilter).sort().reduce((acc, k) => {
    acc[k] = String(branchFilter[k]);
    return acc;
  }, {});
  const scope = allowedModules.length ? allowedModules.join(',') : 'none';
  return `${JSON.stringify(sorted)}:${scope}:${query}`;
}

function isPhoneLike(q) {
  return /^\d[\d\s\-()+ ]*$/.test(q);
}

/**
 * Permission-scoped global search.
 *
 * @param {object} branchFilter - Branch/tenant scoping filter (from filterByBranch)
 * @param {string} query - Raw search term
 * @param {(module: string) => boolean} can - Returns true when the caller may read the module
 */
export async function globalSearch(branchFilter, query, can = () => true) {
  const q = query?.trim();
  if (!q || q.length < 2) {
    return EMPTY_RESULT;
  }

  const allowedModules = [
    'patients', 'appointments', 'billing', 'branches', 'users', 'roles',
    'inventory', 'accounting', 'emr', 'prescriptions',
  ].filter(can);

  const cacheKey = buildSearchCacheKey(branchFilter, q, allowedModules);
  const cached = await cacheGet('search', cacheKey);
  if (cached) return cached;

  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(esc, 'i');
  const phoneLike = isPhoneLike(q);

  const matchedPatients = can('patients')
    ? await Patient.find({
        ...branchFilter,
        $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }, { patientId: regex }],
      })
        .select('firstName lastName phone patientId')
        .limit(5)
        .lean()
    : [];

  const matchedIds = matchedPatients.map((p) => p._id);

  const patientLinkQuery = matchedIds.length ? [{ patient: { $in: matchedIds } }] : [];

  const corePromises = [];
  if (can('appointments')) {
    corePromises.push(
      Appointment.find({
        ...branchFilter,
        $or: [{ reason: regex }, ...patientLinkQuery],
      })
        .populate('patient', 'firstName lastName phone patientId')
        .populate('doctor', 'name')
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }
  if (can('billing')) {
    corePromises.push(
      Invoice.find({
        ...branchFilter,
        $or: [{ invoiceNo: regex }, ...patientLinkQuery],
      })
        .populate('patient', 'firstName lastName phone patientId')
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }
  if (can('branches')) {
    // Branch documents are identified by _id, not by a branch field.
    // A clinic user is scoped to a single branch; system admins scope by tenant.
    const branchSearchFilter = branchFilter.branch
      ? { _id: branchFilter.branch, ...(branchFilter.tenant ? { tenant: branchFilter.tenant } : {}) }
      : branchFilter;
    corePromises.push(
      Branch.find({ ...branchSearchFilter, $or: [{ name: regex }, { address: regex }, { phone: regex }] })
        .select('name address phone')
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }
  if (can('users')) {
    corePromises.push(
      User.find({ ...branchFilter, $or: [{ name: regex }, { email: regex }, { phone: regex }] })
        .select('name email phone roleId branch isDoctor')
        .populate('branch', 'name')
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }
  if (can('billing')) {
    corePromises.push(
      Wallet.find({ ...branchFilter })
        .populate({
          path: 'patient',
          match: { $or: [{ firstName: regex }, { lastName: regex }, { patientId: regex }, { phone: regex }] },
          select: 'firstName lastName phone patientId',
        })
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }
  if (can('billing')) {
    corePromises.push(
      InstallmentPlan.find({ ...branchFilter })
        .populate({
          path: 'patient',
          match: { $or: [{ firstName: regex }, { lastName: regex }, { patientId: regex }, { phone: regex }] },
          select: 'firstName lastName phone patientId',
        })
        .select('planNo totalAmount paidAmount status')
        .limit(5)
        .lean(),
    );
  } else {
    corePromises.push(Promise.resolve([]));
  }

  const textOnlyPromises = [];
  if (!phoneLike && can('roles')) {
    textOnlyPromises.push(
      Role.find({ ...branchFilter, $or: [{ name: regex }, { description: regex }] })
        .select('name description')
        .limit(5)
        .lean(),
    );
  }
  if (!phoneLike && can('inventory')) {
    textOnlyPromises.push(
      InventoryItem.find({ ...branchFilter, $or: [{ name: regex }, { sku: regex }, { category: regex }, { supplier: regex }] })
        .select('name sku category unit quantity reorderPoint')
        .limit(5)
        .lean(),
    );
  }
  if (!phoneLike && can('accounting')) {
    textOnlyPromises.push(
      Expense.find({ ...branchFilter, $or: [{ expenseNo: regex }, { description: regex }, { category: regex }] })
        .select('expenseNo description category amount date')
        .limit(5)
        .lean(),
    );
    textOnlyPromises.push(
      OwnerDrawing.find({ ...branchFilter, $or: [{ drawingNo: regex }, { description: regex }] })
        .select('drawingNo description amount date')
        .populate('owner', 'name')
        .limit(5)
        .lean(),
    );
  }
  if (!phoneLike && can('emr')) {
    textOnlyPromises.push(
      TreatmentPlan.find({ ...branchFilter, $or: [{ title: regex }, { diagnosis: regex }] })
        .select('title diagnosis status')
        .populate('patient', 'firstName lastName patientId')
        .limit(5)
        .lean(),
    );
  }
  if (!phoneLike && can('prescriptions')) {
    textOnlyPromises.push(
      Prescription.find({ ...branchFilter, $or: [{ diagnosis: regex }] })
        .select('diagnosis medications')
        .populate('patient', 'firstName lastName patientId')
        .populate('doctor', 'name')
        .limit(5)
        .lean(),
    );
  }
  if (!phoneLike && can('emr')) {
    textOnlyPromises.push(
      ClinicalNote.find({ ...branchFilter, $or: [{ chiefComplaint: regex }, { examination: regex }, { diagnosis: regex }, { plan: regex }] })
        .select('chiefComplaint examination diagnosis plan visitDate')
        .populate('patient', 'firstName lastName patientId')
        .populate('doctor', 'name')
        .limit(5)
        .lean(),
    );
  }

  const [coreResults, textResults] = await Promise.all([
    Promise.all(corePromises),
    textOnlyPromises.length ? Promise.all(textOnlyPromises) : Promise.resolve([]),
  ]);

  const [
    appointments,
    invoices,
    branches,
    users,
    wallets,
    installments,
  ] = coreResults;

  const [
    roles = [],
    inventory = [],
    expenses = [],
    drawings = [],
    treatmentPlans = [],
    prescriptions = [],
    clinicalNotes = [],
  ] = textResults;

  const filteredWallets = wallets.filter((w) => w.patient);
  const filteredInstallments = installments.filter((i) => i.patient);

  const result = {
    patients: matchedPatients,
    appointments,
    invoices,
    branches,
    users,
    roles,
    inventory,
    expenses,
    drawings,
    treatmentPlans,
    prescriptions,
    clinicalNotes,
    wallets: filteredWallets,
    installments: filteredInstallments,
  };

  await cacheSet('search', cacheKey, result, 60);

  return result;
}