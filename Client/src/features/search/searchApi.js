import api from '../../lib/axios';

export const searchApi = {
  global: (q) => api.get('/search', { params: { q } }).then((r) => r.data.data),
};

const GROUPS = [
  { key: 'patients', module: 'patients' },
  { key: 'appointments', module: 'appointments' },
  { key: 'invoices', module: 'billing' },
  { key: 'wallets', module: 'billing' },
  { key: 'installments', module: 'billing' },
  { key: 'branches', module: 'branches' },
  { key: 'users', module: 'users' },
  { key: 'roles', module: 'roles' },
  { key: 'inventory', module: 'inventory' },
  { key: 'expenses', module: 'accounting' },
  { key: 'drawings', module: 'accounting' },
  { key: 'treatmentPlans', module: 'emr' },
  { key: 'clinicalNotes', module: 'emr' },
  { key: 'prescriptions', module: 'prescriptions' },
];

function patientName(p) {
  return p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—' : '—';
}

/** route target + display mapper for each result kind. */
export function resultView(key) {
  switch (key) {
    case 'patients':
      return {
        route: (r) => `/patients/${r._id}`,
        title: (r) => patientName(r),
        sub: (r) => [r.patientId, r.phone].filter(Boolean).join(' · '),
      };
    case 'appointments':
      return {
        route: () => '/appointments',
        title: (r) => patientName(r.patient),
        sub: (r) => [r.reason, r.doctor?.name].filter(Boolean).join(' · '),
      };
    case 'invoices':
      return {
        route: () => '/billing',
        title: (r) => r.invoiceNo,
        sub: (r) => patientName(r.patient),
      };
    case 'wallets':
      return {
        route: (r) => `/patients/${r.patient?._id}`,
        title: (r) => patientName(r.patient),
        sub: (r) => `balance: ${r.balance}`,
      };
    case 'installments':
      return {
        route: (r) => `/patients/${r.patient?._id}`,
        title: (r) => patientName(r.patient),
        sub: (r) => [r.planNo, `${r.paidAmount}/${r.totalAmount}`, r.status].filter(Boolean).join(' · '),
      };
    case 'branches':
      return {
        route: () => '/branches',
        title: (r) => r.name,
        sub: (r) => [r.address, r.phone].filter(Boolean).join(' · '),
      };
    case 'users':
      return {
        route: () => '/users',
        title: (r) => r.name,
        sub: (r) => [r.email, r.phone].filter(Boolean).join(' · '),
      };
    case 'roles':
      return {
        route: () => '/roles',
        title: (r) => r.name,
        sub: (r) => r.description,
      };
    case 'inventory':
      return {
        route: () => '/inventory',
        title: (r) => `${r.name}${r.sku ? ` (${r.sku})` : ''}`,
        sub: (r) => [r.category, `qty: ${r.quantity}`].filter(Boolean).join(' · '),
      };
    case 'expenses':
      return {
        route: () => '/accounting',
        title: (r) => r.expenseNo || r.description || 'Expense',
        sub: (r) => [r.category, `${r.amount}`].filter(Boolean).join(' · '),
      };
    case 'drawings':
      return {
        route: () => '/accounting',
        title: (r) => r.drawingNo || r.description || 'Drawing',
        sub: (r) => r.owner?.name,
      };
    case 'treatmentPlans':
      return {
        route: (r) => `/patients/${r.patient?._id}`,
        title: (r) => r.title || r.diagnosis,
        sub: (r) => [patientName(r.patient), r.status].filter(Boolean).join(' · '),
      };
    case 'clinicalNotes':
      return {
        route: (r) => `/patients/${r.patient?._id}`,
        title: (r) => r.chiefComplaint || r.diagnosis || 'Clinical note',
        sub: (r) => patientName(r.patient),
      };
    case 'prescriptions':
      return {
        route: (r) => `/patients/${r.patient?._id}`,
        title: (r) => r.diagnosis || 'Prescription',
        sub: (r) => [patientName(r.patient), r.doctor?.name].filter(Boolean).join(' · '),
      };
    default:
      return { route: () => '#', title: () => '—', sub: () => '—' };
  }
}

export { GROUPS };