/**
 * Single source of truth for every Socket.IO event name the client uses.
 *
 * These were previously bare string literals spread across ~20 components, which
 * meant a server-side rename broke realtime updates with no compile error and no
 * stack trace — the page just silently stopped updating. Import the constant
 * instead of the string so a rename is a one-line change here and the linter
 * finds every consumer.
 *
 * Names are taken from the server's emit sites. Frozen so a stray assignment
 * fails loudly in development rather than corrupting the registry at runtime.
 *
 * Note the inconsistent casing that already exists on the wire
 * (`appointment:statusChanged` is camelCase while everything else is
 * snake_case after the colon). It is preserved exactly as the server emits it;
 * normalising it is a breaking wire change that has to land on both sides at
 * once, so it is not done here.
 */

/** Events the server pushes to the client. */
export const SOCKET_EVENTS = Object.freeze({
  // Appointments & queue
  APPOINTMENT_CREATED: 'appointment:created',
  APPOINTMENT_UPDATED: 'appointment:updated',
  APPOINTMENT_STATUS_CHANGED: 'appointment:statusChanged',
  QUEUE_STATUS_CHANGED: 'queue.status.changed',
  QUEUE_PATIENT_CALLED: 'queue.patient.called',

  // Patients
  PATIENT_CREATED: 'patient:created',
  PATIENT_UPDATED: 'patient:updated',
  PATIENT_ARCHIVED: 'patient:archived',
  PATIENT_MERGED: 'patient:merged',

  // Billing
  INVOICE_CREATED: 'invoice:created',
  INVOICE_UPDATED: 'invoice:updated',
  PAYMENT_RECORDED: 'payment.recorded',

  // Clinical record
  CLINICAL_NOTE_CREATED: 'clinical-note:created',
  CLINICAL_NOTE_UPDATED: 'clinical-note:updated',
  CLINICAL_NOTE_DELETED: 'clinical-note:deleted',
  TREATMENT_PLAN_CREATED: 'treatment-plan:created',
  TREATMENT_PLAN_UPDATED: 'treatment-plan:updated',
  PRESCRIPTION_CREATED: 'prescription:created',
  PRESCRIPTION_UPDATED: 'prescription:updated',
  PRESCRIPTION_DELETED: 'prescription:deleted',
  CHART_UPDATED: 'chart:updated',
  CONSENT_CREATED: 'consent:created',
  CONSENT_UPDATED: 'consent:updated',
  CONSENT_SIGNED: 'consent:signed',
  CONSENT_DECLINED: 'consent:declined',
  CONSENT_WITHDRAWN: 'consent:withdrawn',
  CONSENT_DELETED: 'consent:deleted',

  // Inventory
  INVENTORY_CREATED: 'inventory:created',
  INVENTORY_UPDATED: 'inventory:updated',
  INVENTORY_DELETED: 'inventory:deleted',
  STOCK_LOW: 'stock.low',
  STOCK_EXPIRING: 'stock.expiring',
  STOCK_EXPIRED: 'stock.expired',

  // Patient finance
  WALLET_UPDATED: 'wallet:updated',
  INSTALLMENT_CREATED: 'installment:created',
  INSTALLMENT_UPDATED: 'installment:updated',
  INSTALLMENT_PAID: 'installment:paid',
  INSTALLMENT_OVERDUE: 'installment.overdue',

  // Accounting
  EXPENSE_CREATED: 'expense:created',
  EXPENSE_DELETED: 'expense:deleted',
  DRAWING_CREATED: 'drawing:created',
  DRAWING_DELETED: 'drawing:deleted',
  COMMISSION_UPDATED: 'commission:updated',
  DAY_CLOSE_CLOSED: 'dayclose:closed',

  // Admin
  USER_CREATED: 'user:created',
  USER_UPDATED: 'user:updated',
  USER_DELETED: 'user:deleted',
  USER_TOGGLED: 'user:toggled',
  ROLE_CREATED: 'role:created',
  ROLE_UPDATED: 'role:updated',
  ROLE_DELETED: 'role:deleted',
  BRANCH_CREATED: 'branch:created',
  BRANCH_UPDATED: 'branch:updated',
  BRANCH_DELETED: 'branch:deleted',
  AUTOMATION_NOTIFY: 'automation:notify',

  // Chat
  CHAT_MESSAGE: 'chat:message',
  CHAT_READ: 'chat:read',
});

/** Events the client sends to the server (subscriptions). */
export const SOCKET_EMITS = Object.freeze({
  SUBSCRIBE_BRANCH: 'subscribe:branch',
  UNSUBSCRIBE_BRANCH: 'unsubscribe:branch',
  SUBSCRIBE_QUEUE: 'subscribe:queue',
  UNSUBSCRIBE_QUEUE: 'unsubscribe:queue',
});
