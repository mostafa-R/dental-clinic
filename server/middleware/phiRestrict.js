/**
 * Middleware that marks the request when an impersonation session is active,
 * so downstream controllers / serializers can choose to omit PHI fields.
 *
 * The clinic auth middleware (`protect`) sets `req.user._impersonating` when the
 * access token carries `type: 'impersonation'`; this middleware lifts that flag
 * to `req.isImpersonation` for controllers.
 *
 * Usage:
 *   import { phiRestrict } from '../middleware/phiRestrict.js';
 *   router.get('/patients', protect, checkPermission('patients', 'read'), phiRestrict, patientController.list);
 */
export function phiRestrict(req, _res, next) {
  if (req.user && req.user._impersonating) {
    req.isImpersonation = true;
  }
  next();
}

/**
 * Fields considered Protected Health Information. Deleted recursively (see
 * `stripPHI`) from any response sent during an impersonation session.
 */
const PHI_FIELDS = new Set([
  'phone',
  'email',
  'address',
  'dateOfBirth',
  'ssn',
  'nationalId',
  'diagnosis',
  'chiefComplaint',
  'examination',
  'plan',
  'medicalHistory',
  'chronicConditions',
  'allergies',
  'notes',
  'medications',
  'emergencyContact',
  'insurance',
  'nextAppointmentNotes',
  // Contact / demographic PHI fields present on Patient (and nested records).
  'mobile',
  'secondaryPhone',
  'emergencyPhone',
  'guardian',
  'guardianName',
  'guardianPhone',
  'occupation',
  'bloodGroup',
  'nationality',
  'maritalStatus',
  'religion',
  'socialStatus',
  'insuranceNumber',
  // Clinical-consent / attachment content is PHI too.
  'termsText',
  'declineReason',
  'withdrawReason',
  'caption',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Strips PHI fields from a patient/EMR object, recursing into nested objects
 * and arrays so fields like `teeth[].notes`, `items[].notes`,
 * `medicalHistory`, `medications`, `emergencyContact` and `insurance` are
 * masked too.
 *
 * Mongoose documents (and populated sub-documents) are NOT plain objects, so
 * they are converted with `.toJSON()` first — otherwise the recursion would
 * miss every field inside a raw document (this is what leaked PHI to
 * impersonated sockets). Dates and other non-plain values are preserved.
 * Call this before sending the response when req.isImpersonation is true.
 */
export function stripPHI(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !isPlainObject(value) &&
    typeof value.toJSON === 'function' &&
    !(value instanceof Date)
  ) {
    return stripPHI(value.toJSON());
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripPHI(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const clone = { ...value };
  for (const key of Object.keys(clone)) {
    if (PHI_FIELDS.has(key)) {
      delete clone[key];
    } else if (clone[key] && typeof clone[key] === 'object') {
      clone[key] = stripPHI(clone[key]);
    }
  }
  return clone;
}
