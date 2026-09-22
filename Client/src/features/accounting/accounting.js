export const EXPENSE_CATEGORIES = [
  'salary',
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'marketing',
  'other',
];

export const EXPENSE_CATEGORY_LABELS = {
  salary: 'Salaries',
  rent: 'Rent',
  utilities: 'Utilities',
  supplies: 'Supplies',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  other: 'Other',
};

export const EXPENSE_PAYMENT_METHODS = ['cash', 'bank', 'card', 'wallet'];

export const EXPENSE_PAYMENT_LABELS = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  card: 'Card',
  wallet: 'Wallet',
};

export const WALLET_TX_TYPES = ['credit', 'debit'];

export const WALLET_TX_LABELS = {
  credit: 'Credit',
  debit: 'Debit',
};

export const INSTALLMENT_STATUS = ['pending', 'paid', 'overdue'];

export const INSTALLMENT_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

export const INSTALLMENT_STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  overdue: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export const INSTALLMENT_PLAN_STATUS = ['active', 'completed', 'defaulted'];

export const INSTALLMENT_PLAN_STATUS_LABELS = {
  active: 'Active',
  completed: 'Completed',
  defaulted: 'Defaulted',
};

export const INSTALLMENT_PLAN_STATUS_STYLES = {
  active: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  defaulted: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export const COMMISSION_STATUS = ['pending', 'paid'];

export const COMMISSION_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
};

export const INSTALLMENT_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'custom'];

export const INSTALLMENT_FREQUENCIES_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

export const COMMISSION_STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};
