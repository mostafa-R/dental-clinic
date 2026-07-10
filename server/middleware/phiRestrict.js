/**
 * Middleware that marks the request when an impersonation session is active,
 * so downstream controllers / serializers can choose to omit PHI fields.
 *
 * Usage:
 *   import { phiRestrict } from '../middleware/phiRestrict.js';
 *   router.get('/patients', phiRestrict, patientController.list);
 *
 * In your controller:
 *   if (req.isImpersonation) {
 *     // strip phone, email, address, etc.
 *   }
 */
export function phiRestrict(req, _res, next) {
  // The clinic auth middleware decodes the token; impersonation tokens
  // carry `type: 'impersonation'`.
  if (req.user && req.user._impersonating) {
    req.isImpersonation = true;
  }
  next();
}

/**
 * Strips PHI fields from a patient/user object.
 * Call this before sending the response when req.isImpersonation is true.
 */
export function stripPHI(obj) {
  if (!obj) return obj;
  const clone = { ...obj };
  const phiFields = ['phone', 'email', 'address', 'dateOfBirth', 'ssn', 'nationalId', 'diagnosis', 'chiefComplaint', 'examination', 'plan', 'medicalHistory', 'chronicConditions', 'allergies', 'notes'];
  for (const field of phiFields) {
    delete clone[field];
  }
  return clone;
}