import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import api from '../../lib/axios';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
import { createDrawing, resetFormState } from './accountingSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

export default function OwnerDrawingModal({ open, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.accounting.formStatus);

  const [owners, setOwners] = useState([]);
  const [owner, setOwner] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setOwner('');
    setAmount('');
    setDescription('');
    setDate('');
    dispatch(resetFormState());
    api.get('/users', { params: { role: 'clinic_admin' } }).then((r) => {
      setOwners(r.data.data.users || []);
    }).catch(() => setOwners([]));
  }, [open, dispatch]);

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!owner || !Number.isFinite(value) || value <= 0) {
      dispatch(showErrorDialog({ message: t('accounting.needFields') }));
      return;
    }
    try {
      await dispatch(
        createDrawing({
          owner,
          amount: Math.round((value + Number.EPSILON) * 100) / 100,
          description: description.trim() || undefined,
          date: date ? new Date(date).toISOString() : undefined,
        }),
      ).unwrap();
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500';

  return (
    <Modal
      open={open}
      title={t('accounting.drawing.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="drawing-form" disabled={formStatus === 'loading'}>
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="drawing-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>{t('accounting.drawing.owner')}</label>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t('accounting.drawing.selectOwner')}</option>
            {owners.map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('accounting.amount')}</label>
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" />
          </div>
          <div>
            <label className={labelCls}>{t('accounting.date')}</label>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('accounting.drawing.description')}</label>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>
      </form>
    </Modal>
  );
}
