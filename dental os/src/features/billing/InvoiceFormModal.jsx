import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { showErrorDialog } from '../ui/uiSlice';
import { patientApi } from '../patients/patientApi';
import api from '../../lib/axios';
import { createInvoice, resetFormState, updateInvoice } from './billingSlice';
import { formatMoney } from '../../lib/format';
import { useT } from '../../lib/i18n';

const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0 };

const EMPTY_FORM = {
  patient: '',
  branch: '',
  items: [{ ...EMPTY_ITEM }],
  discount: '',
  discountType: 'fixed',
  discountRate: '',
  tax: '',
  taxRate: '',
  dueDate: '',
  notes: '',
};

function round2(n) {
  const x = Number(n) || 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function parseDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toForm(invoice) {
  return {
    patient: invoice.patient?._id || invoice.patient || '',
    branch: invoice.branch?._id || invoice.branch || '',
    items:
      invoice.items?.length > 0
        ? invoice.items.map((it) => ({
            description: it.description || '',
            quantity: it.quantity ?? 1,
            unitPrice: it.unitPrice ?? 0,
          }))
        : [{ ...EMPTY_ITEM }],
    discount: invoice.discount ? String(invoice.discount) : '',
    discountType: invoice.discountType || 'fixed',
    discountRate: invoice.discountRate ? String(invoice.discountRate) : '',
    tax: invoice.tax ? String(invoice.tax) : '',
    taxRate: invoice.taxRate ? String(invoice.taxRate) : '',
    dueDate: parseDate(invoice.dueDate),
    notes: invoice.notes || '',
  };
}

function buildPayload(form) {
  const items = form.items
    .filter((it) => it.description.trim())
    .map((it) => ({
      description: it.description.trim(),
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
    }));
  const payload = { items };
  if (form.discount !== '') payload.discount = Number(form.discount) || 0;
  if (form.discountType) payload.discountType = form.discountType;
  if (form.discountRate !== '') payload.discountRate = Number(form.discountRate) || 0;
  if (form.tax !== '') payload.tax = Number(form.tax) || 0;
  if (form.taxRate !== '') payload.taxRate = Number(form.taxRate) || 0;
  if (form.dueDate) payload.dueDate = new Date(form.dueDate).toISOString();
  if (form.notes.trim()) payload.notes = form.notes.trim();
  if (form.branch) payload.branch = form.branch;
  return payload;
}

export default function InvoiceFormModal({ open, invoice, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { formStatus } = useSelector((s) => s.billing);
  const myPermissions = useSelector((s) => s.users.myPermissions);
  const isSuperAdmin = myPermissions?.isSystemAdmin ?? false;
  const isEdit = Boolean(invoice);

  const [form, setForm] = useState(EMPTY_FORM);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [branches, setBranches] = useState([]);

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPatientsLoading(true);
    patientApi
      .list({ limit: 100, isActive: 'true' })
      .then((d) => {
        if (!cancelled) setPatients(d.patients || []);
      })
      .catch(() => {
        if (!cancelled) setPatients([]);
      })
      .finally(() => {
        if (!cancelled) setPatientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isSuperAdmin) return;
    api
      .get('/branches')
      .then((r) => setBranches(r.data.data?.branches || []))
      .catch(() => {});
  }, [open, isSuperAdmin]);

  useEffect(() => {
    if (!open) return;
    setForm(invoice ? toForm(invoice) : { ...EMPTY_FORM });
    dispatch(resetFormState());
  }, [open, invoice, dispatch]);

  const totals = useMemo(() => {
    const subtotal = round2(
      form.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    );
    let discount = 0;
    if (form.discountType === 'percentage') {
      const rate = Math.min(Math.max(Number(form.discountRate) || 0, 0), 100);
      discount = round2(subtotal * rate / 100);
    } else {
      discount = round2(Math.min(Number(form.discount) || 0, subtotal));
    }
    let tax = round2(Math.max(Number(form.tax) || 0, 0));
    if (tax === 0 && form.taxRate) {
      const taxRate = Math.min(Math.max(Number(form.taxRate) || 0, 0), 100);
      tax = round2((subtotal - discount) * taxRate / 100);
    }
    const total = round2(subtotal - discount + tax);
    return { subtotal, discount, tax, total };
  }, [form]);

  const setItem = (i, key, value) => {
    setForm((f) => {
      const items = [...f.items];
      items[i] = { ...items[i], [key]: value };
      return { ...f, items };
    });
  };
  const addItem = () =>
    setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (i) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitting = formStatus === 'loading';

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient) {
      dispatch(showErrorDialog({ message: t('billing.form.selectPatient') }));
      return;
    }
    const payload = { ...buildPayload(form), patient: form.patient };
    try {
      if (isEdit) {
        await dispatch(updateInvoice({ id: invoice._id, payload })).unwrap();
      } else {
        await dispatch(createInvoice(payload)).unwrap();
      }
      onSaved?.();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const labelCls = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200';

  return (
    <Modal
      open={open}
      title={isEdit ? t('billing.form.edit') : t('billing.form.new')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="invoice-form"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('billing.form.create')}
          </button>
        </>
      }
    >
      {formStatus === 'loading' && (
        <div className="mb-3"><Spinner label={t('common.saving')} /></div>
      )}

      <form id="invoice-form" onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{t('billing.col.patient')} <span className="text-red-500">*</span></span>
            <select
              value={form.patient}
              onChange={set('patient')}
              required
              disabled={isEdit || patientsLoading}
              className={inputCls}
            >
              <option value="">{patientsLoading ? t('common.loading') : t('billing.form.selectPatient')}</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.fullName} — {p.patientId}
                </option>
              ))}
            </select>
          </label>
          {isSuperAdmin && (
            <label className="block">
              <span className={labelCls}>{t('appointments.form.branch')} <span className="text-red-500">*</span></span>
              <select value={form.branch} onChange={set('branch')} required className={inputCls}>
                <option value="" disabled>{t('appointments.form.selectBranch')}</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={labelCls}>{t('billing.form.dueDate')}</span>
            <input type="date" value={form.dueDate} onChange={set('dueDate')} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>{t('billing.form.notes')}</span>
            <input value={form.notes} onChange={set('notes')} placeholder={t('billing.form.notesPlaceholder')} className={inputCls} />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{t('billing.form.lineItems')}</h4>
            <button type="button" onClick={addItem} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              {t('billing.form.addItem')}
            </button>
          </div>
          <div className="space-y-2">
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={it.description}
                  onChange={(e) => setItem(i, 'description', e.target.value)}
                  placeholder={t('billing.form.descriptionPlaceholder')}
                  className="col-span-12 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:col-span-6"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={it.quantity}
                  onChange={(e) => setItem(i, 'quantity', e.target.value)}
                  placeholder={t('billing.form.qty')}
                  className="col-span-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:col-span-2"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => setItem(i, 'unitPrice', e.target.value)}
                  placeholder={t('billing.form.unitPrice')}
                  className="col-span-8 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:col-span-3"
                />
                <div className="col-span-8 flex items-center justify-end text-sm text-slate-500 dark:text-slate-400 sm:col-span-1">
                  {formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="col-span-4 rounded-md px-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-600 sm:col-span-12 sm:justify-self-end dark:hover:bg-slate-800"
                  aria-label="Remove"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="block">
              <span className={labelCls}>{t('billing.form.discount')}</span>
              <div className="flex gap-2">
                <select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))} className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <option value="fixed">{t('billing.form.fixed')}</option>
                  <option value="percentage">{t('billing.form.percentage')}</option>
                </select>
                {form.discountType === 'percentage' ? (
                  <input type="number" min="0" max="100" step="0.1" value={form.discountRate} onChange={set('discountRate')} placeholder="0" className={inputCls} />
                ) : (
                  <input type="number" min="0" step="0.01" value={form.discount} onChange={set('discount')} placeholder="0.00" className={inputCls} />
                )}
              </div>
            </div>
            <div className="block">
              <span className={labelCls}>{t('billing.form.tax')}</span>
              <div className="flex gap-2">
                <input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={set('taxRate')} placeholder={t('billing.form.rate')} className={`${inputCls} w-20`} />
                <input type="number" min="0" step="0.01" value={form.tax} onChange={set('tax')} placeholder="0.00" className={inputCls} />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <Row label={t('billing.form.subtotal')} value={formatMoney(totals.subtotal)} />
            <Row label={t('billing.form.discount')} value={`- ${formatMoney(totals.discount)}`} />
            <Row label={t('billing.form.tax')} value={`+ ${formatMoney(totals.tax)}`} />
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-white">{t('billing.form.total')}</span>
              <span className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{formatMoney(totals.total)}</span>
            </div>
          </div>
        </div>

        {isEdit && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('billing.form.noEditAfterCreate')}</p>
        )}
      </form>
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}
