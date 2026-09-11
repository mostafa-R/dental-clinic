/**
 * Automation engine constants (PRD §12.3).
 *
 * The engine executes a naive loop over system events:
 *   Trigger (event.type) → Condition (field.op value) → Action.
 *
 * Conditions and action templates resolve against the event's `data`
 * sub-object first, then the event root, via `{{dot.path}}` placeholders.
 */

/**
 * Business events published by the Event Bus. Each key is stored on both the
 * `events` log and the `automations.trigger.type` field.
 * Label pairs are returned by `GET /api/v1/automations/triggers` for the UI.
 */
export const TRIGGER_TYPES = [
  { key: 'appointment.created', label: 'New appointment booked' },
  { key: 'appointment.confirmed', label: 'Appointment confirmed' },
  { key: 'appointment.completed', label: 'Appointment completed' },
  { key: 'appointment.cancelled', label: 'Appointment cancelled' },
  { key: 'appointment.no_show', label: 'Patient no-show' },
  { key: 'patient.created', label: 'New patient registered' },
  { key: 'consent.signed', label: 'Consent signed (e-signature)' },
  { key: 'consent.expired', label: 'Consent expired (not answered)' },
  { key: 'invoice.paid', label: 'Invoice settled' },
  { key: 'installment.overdue', label: 'Installment overdue' },
  { key: 'inventory.low_stock', label: 'Low stock (reorder point)' },
  { key: 'queue.joined', label: 'Patient joined the queue' },
  { key: 'queue.position_changed', label: 'Queue position changed' },
  { key: 'queue.near_turn', label: 'Queue near turn' },
  { key: 'queue.turn_now', label: 'Queue turn now' },
];

export const TRIGGER_KEYS = TRIGGER_TYPES.map((t) => t.key);

/**
 * Condition operators evaluated against a dot-path in the event payload.
 */
export const CONDITION_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'contains',
  'in',
  'nin',
  'startsWith',
];

/**
 * Executable actions. `notify_branch` and `send_whatsapp` are internal;
 * `webhook` posts the event JSON to an external URL.
 */
export const ACTION_TYPES = ['send_whatsapp', 'notify_branch', 'webhook'];

/**
 * Ready-made templates installed per clinic via
 * `POST /api/v1/automations/install-templates` (idempotent by name). They are
 * installed DISABLED so they never duplicate the built-in WhatsApp crons until
 * a clinic admin enables them.
 */
export const DEFAULT_TEMPLATES = [
  {
    key: 'no-show-reschedule',
    name: 'No-show reschedule (WhatsApp)',
    description: 'Send a friendly reschedule offer when the patient misses their appointment.',
    trigger: { type: 'appointment.no_show' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'فاتنا موعدك اليوم 🦷',
            '',
            `مرحباً {{patient.firstName}}،`,
            'لم نتمكن من استقبالك في موعدك. يسعدنا إعادة جدولة الموعد في وقت يناسبك — تواصل معنا.',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'post-visit-survey',
    name: 'Post-visit survey (WhatsApp)',
    description: 'Ask for quick feedback after a completed visit.',
    trigger: { type: 'appointment.completed' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'نسعد بخدمتك 🌟',
            '',
            `مرحباً {{patient.firstName}}،`,
            'نشكرك على زيارتنا. حياً نمكن تقييم تجربتك بنجمات/قياس رضاك في استبيان قصير.',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'smart-reorder',
    name: 'Smart reorder alert (branch)',
    description: 'Notify the branch room when an item falls to its reorder point.',
    trigger: { type: 'inventory.low_stock' },
    conditions: [],
    actions: [
      {
        type: 'notify_branch',
        config: {
          message: 'انخفاض مخزون: {{item.name}} ({{item.quantity}} {{item.unit}}) — تحتاج طلب تعبئة 🔔',
        },
      },
    ],
    cooldownMinutes: 60,
  },
  {
    key: 'queue-joined',
    name: 'Queue joined (WhatsApp)',
    description: 'Tell the patient their queue number after a same-day confirmed booking.',
    trigger: { type: 'queue.joined' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'تم تأكيد حجزك اليوم ✅',
            '',
            `مرحباً {{patient.firstName}}،`,
            'موعدك اليوم في عيادتنا مع د. {{doctor.name}}.',
            '',
            `🔢 رقمك في الدور: {{queueNumber}}`,
            `👥 يوجد أمامك حاليًا: {{patientsAhead}} مريض/مرضى`,
            '',
            'سنخبرك عند اقتراب دورك 🦷',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'queue-position',
    name: 'Queue position update (WhatsApp)',
    description: 'Quick position milestones as the queue moves.',
    trigger: { type: 'queue.position_changed' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'تحديث الدور 🦷',
            '',
            `مرحباً {{patient.firstName}}،`,
            `أصبح عدد المرضى أمامك: {{patientsAhead}}.`,
            '',
            'الرجاء الاستعداد للحضور لما يصل دورك.',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'queue-near-turn',
    name: 'Queue near turn (WhatsApp)',
    description: 'Warn the patient the turn is approaching (≤ 3 ahead, short wait).',
    trigger: { type: 'queue.near_turn' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'دورك اقترب 🦷',
            '',
            `مرحباً {{patient.firstName}}،`,
            `وقت الانتظار المتوقع حوالي {{estimatedWaitMinutes}} دقيقة.`,
            `يوجد أمامك حاليًا: {{patientsAhead}}.`,
            '',
            'الرجاء الاقتراب من العيادة إن أمكن 🌟',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'queue-turn-now',
    name: 'Queue turn now (WhatsApp)',
    description: 'Call the patient to the doctor room.',
    trigger: { type: 'queue.turn_now' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'حان دورك الآن 🦷',
            '',
            `مرحباً {{patient.firstName}}،`,
            'برجاء التوجه إلى غرفة د. {{doctor.name}} الآن.',
            'شكرًا لانتظارك ❤️',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 0,
  },
  {
    key: 'installment-reminder',
    name: 'Installment reminder (WhatsApp)',
    description: 'Remind the patient about an overdue installment.',
    trigger: { type: 'installment.overdue' },
    conditions: [],
    actions: [
      {
        type: 'send_whatsapp',
        config: {
          to: '{{patient.phone}}',
          message: [
            'تنبيه أقساط متأخرة 🦷',
            '',
            `مرحباً {{patient.firstName}}،`,
            `لديك قسط متأخر بقيمة {{overdueAmount}} على خطة "{{planTitle}}".`,
            'يرجى السداد في أقرب فرصة — شكراً لتعاونك.',
          ].join('\n'),
        },
      },
    ],
    cooldownMinutes: 1440,
  },
];