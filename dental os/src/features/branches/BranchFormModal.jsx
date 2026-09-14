import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import { createBranch, updateBranch, resetFormState } from './branchSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function defaultDay(day) {
  if (day === 'sunday' || day === 'saturday') {
    return { closed: true, open: '', close: '' };
  }
  return { closed: false, open: '09:00', close: '17:00' };
}

function normalizeStoredHours(stored) {
  const hours = {};
  for (const day of DAYS) {
    const d = stored?.[day];
    if (!d || d.closed) {
      hours[day] = defaultDay(day);
    } else {
      hours[day] = {
        closed: false,
        open: d.open || '09:00',
        close: d.close || '17:00',
      };
    }
  }
  return hours;
}

function buildHoursPayload(hours) {
  const payload = {};
  for (const day of DAYS) {
    const d = hours[day];
    payload[day] = d.closed
      ? { closed: true, open: null, close: null }
      : { closed: false, open: d.open || null, close: d.close || null };
  }
  return payload;
}

export default function BranchFormModal({ open, onClose, branch }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.branches.formStatus);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [workingHours, setWorkingHours] = useState(() => normalizeStoredHours({}));

  useEffect(() => {
    if (!open) return;
    dispatch(resetFormState());
    if (branch) {
      setName(branch.name || '');
      setAddress(branch.address || '');
      setPhone(branch.phone || '');
      setIsActive(branch.isActive ?? true);
      setWorkingHours(normalizeStoredHours(branch.workingHours));
    } else {
      setName('');
      setAddress('');
      setPhone('');
      setIsActive(true);
      setWorkingHours(normalizeStoredHours({}));
    }
  }, [open, branch, dispatch]);

  const setDay = (day, patch) => {
    setWorkingHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  const submit = async () => {
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      isActive,
      workingHours: buildHoursPayload(workingHours),
    };

    try {
      if (branch) {
        await dispatch(updateBranch({ id: branch._id, payload })).unwrap();
      } else {
        await dispatch(createBranch(payload)).unwrap();
      }
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';
  const disabledInputCls = inputCls + ' opacity-50 disabled:cursor-not-allowed';

  return (
    <Modal
      open={open}
      title={branch ? t('branches.form.edit') : t('branches.form.new')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={formStatus === 'loading'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.name')} *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.phone')}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} maxLength={30} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('branches.form.address')}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} maxLength={200} />
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="branchIsActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="branchIsActive" className="text-sm text-slate-600 dark:text-slate-300">{t('branches.form.active')}</label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{t('branches.form.workingHours')}</h4>
            <span className="text-xs text-slate-400 dark:text-slate-500">{t('branches.form.workingHoursHint')}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            {DAYS.map((day, i) => {
              const d = workingHours[day];
              return (
                <div
                  key={day}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''} ${d?.closed ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-24 text-sm font-medium ${d?.closed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                      {t(`branches.form.days.${day}`)}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={Boolean(d?.closed)}
                        onChange={(e) => setDay(day, { closed: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {t('branches.form.closed')}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={d?.open || ''}
                      disabled={d?.closed}
                      onChange={(e) => setDay(day, { open: e.target.value })}
                      className={disabledInputCls}
                    />
                    <span className="text-slate-300 dark:text-slate-600">–</span>
                    <input
                      type="time"
                      value={d?.close || ''}
                      disabled={d?.closed}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                      className={disabledInputCls}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}