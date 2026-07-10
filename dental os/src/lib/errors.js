import { t } from './i18n';

const FIELD_KEYS = {
  firstName: 'patients.form.firstName',
  lastName: 'patients.form.lastName',
  phone: 'patients.form.phone',
  email: 'patients.form.email',
  dateOfBirth: 'patients.form.dob',
  gender: 'patients.form.gender',
  address: 'patients.form.address',
  branch: 'patients.form.branch',
  password: 'login.password',
  name: 'patients.col.name',
  role: 'role.accountant',
};

const MESSAGE_HINTS = [
  { match: /required/i, key: 'error.hint.required' },
  { match: /invalid email/i, key: 'error.hint.email' },
  { match: /phone.*(may contain|invalid)|invalid phone/i, key: 'error.hint.phone' },
  { match: /length 24|invalid branch id/i, key: 'error.hint.branch' },
  { match: /at least \d+ characters/i, key: 'error.hint.short' },
  { match: /already exists|duplicate/i, key: 'error.hint.duplicate' },
];

function detailHint(msg) {
  if (!msg) return '';
  const text = Array.isArray(msg) ? msg[0] : String(msg);
  for (const { match, key } of MESSAGE_HINTS) {
    if (match.test(text)) return t(key);
  }
  return text;
}

export function formatFieldErrors(details) {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details).map(([field, msg]) => ({
    field: FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field,
    message: detailHint(msg),
  }));
}

/**
 * Convert a raw API error body (or any thrown value) into a user-friendly
 * dialog payload: { title, message, fields }.
 * `body` may be an axios error, a response data object, a string, or undefined.
 */
export function toFriendlyError(raw) {
  let body = raw;
  if (raw && typeof raw === 'object') {
    body = raw.response?.data ?? raw;
  }
  const message = (typeof body === 'string' ? body : body?.message) || t('error.fallback');
  const status = body?.status ?? raw?.response?.status;
  const lower = String(message).toLowerCase();
  const fields = formatFieldErrors(body?.details);

  let title = t('error.title');
  let text = message;

  if (lower.includes('invalid email or password')) {
    title = t('error.signInFailed');
    text = t('error.signInFailedMsg');
  } else if (lower.includes('validation failed') || fields.length) {
    title = t('error.checkInput');
    text = t('error.checkInputMsg');
  } else if (lower.includes('not authenticated') || lower.includes('session expired')) {
    title = t('error.sessionExpired');
    text = t('error.sessionExpiredMsg');
  } else if (status === 401) {
    title = t('error.sessionExpired');
    text = t('error.sessionExpiredMsg');
  } else if (lower.includes('forbidden') || lower.includes('permission') || status === 403) {
    title = t('error.notAllowed');
    text = t('error.notAllowedMsg');
  } else if (lower.includes('not found') || status === 404) {
    title = t('error.notFound');
    text = t('error.notFoundMsg');
  } else if (lower.includes('duplicate') || lower.includes('already exists')) {
    title = t('error.alreadyExists');
    text = t('error.alreadyExistsMsg');
  } else if (status === 409) {
    title = t('error.title');
    text = message;
  } else if (status >= 500) {
    title = t('error.serverError');
    text = t('error.serverErrorMsg');
  } else if (lower.includes('failed to') || lower.includes('could not')) {
    title = t('error.actionFailed');
    text = message;
  }

  return { title, message: text, fields };
}
