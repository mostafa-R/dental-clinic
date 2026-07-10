import { useEffect, useState } from 'react';

import {
  TOOTH_STATES,
  describeTooth,
  toothStyle,
} from '../../lib/dental';
import { useT } from '../../lib/i18n';

const SURFACE_CONDITION_HEX = {
  sound: '#e2e8f0',
  caries: '#fb7185',
  restored: '#38bdf8',
};

const CONDITION_ORDER = ['sound', 'caries', 'restored'];

function nextCondition(current) {
  const idx = CONDITION_ORDER.indexOf(current);
  return CONDITION_ORDER[(idx + 1) % CONDITION_ORDER.length];
}

function StateButton({ state, active, onClick, label }) {
  const style = toothStyle(state);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
      {label}
    </button>
  );
}

export default function ToothPanel({ tooth, onSave, saving, onCancel }) {
  const { t } = useT();
  const meta = tooth ? describeTooth(tooth.number) : null;

  const [state, setState] = useState(tooth?.state || 'sound');
  const [surfaces, setSurfaces] = useState({
    mesial: tooth?.surfaces?.mesial || 'sound',
    distal: tooth?.surfaces?.distal || 'sound',
    buccal: tooth?.surfaces?.buccal || 'sound',
    lingual: tooth?.surfaces?.lingual || 'sound',
    occlusal: tooth?.surfaces?.occlusal || 'sound',
  });
  const [notes, setNotes] = useState(tooth?.notes || '');

  useEffect(() => {
    if (!tooth) return;
    setState(tooth.state || 'sound');
    setSurfaces({
      mesial: tooth.surfaces?.mesial || 'sound',
      distal: tooth.surfaces?.distal || 'sound',
      buccal: tooth.surfaces?.buccal || 'sound',
      lingual: tooth.surfaces?.lingual || 'sound',
      occlusal: tooth.surfaces?.occlusal || 'sound',
    });
    setNotes(tooth.notes || '');
  }, [tooth]);

  if (!tooth || !meta) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
        <p className="text-sm text-slate-400 dark:text-slate-500">{t('emr.tooth.selectHint')}</p>
      </div>
    );
  }

  const cycleSurface = (surface) => {
    setSurfaces((prev) => ({ ...prev, [surface]: nextCondition(prev[surface]) }));
  };

  // 3x3 grid layout: Buccal (top), Mesial/Occlusal/Distal (mid), Lingual (bottom).
  const zones = [
    { surface: null, key: 'tl' },
    { surface: 'buccal', key: 't' },
    { surface: null, key: 'tr' },
    { surface: 'mesial', key: 'ml' },
    { surface: 'occlusal', key: 'c' },
    { surface: 'distal', key: 'mr' },
    { surface: null, key: 'bl' },
    { surface: 'lingual', key: 'b' },
    { surface: null, key: 'br' },
  ];

  const submit = () => {
    onSave({ state, surfaces, notes });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('emr.tooth.title', { n: meta.universal })}
          </h4>
          <span className="text-xs text-slate-400 dark:text-slate-500">{meta.name}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{t('emr.numbering.universal')}: <strong className="text-slate-700 dark:text-slate-200">{meta.universal}</strong></span>
          <span>{t('emr.numbering.palmer')}: <strong className="text-slate-700 dark:text-slate-200">{meta.palmerNotation}</strong></span>
          <span>{t('emr.numbering.fdi')}: <strong className="text-slate-700 dark:text-slate-200">{meta.fdi}</strong></span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.tooth.state')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOOTH_STATES.map((s) => (
            <StateButton
              key={s}
              state={s}
              active={state === s}
              onClick={() => setState(s)}
              label={t(`emr.state.${s}`)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.tooth.surfaces')}</p>
        <div className="grid max-w-[220px] grid-cols-3 gap-1.5">
          {zones.map((zone) => {
            if (!zone.surface) return <div key={zone.key} className="aspect-square" />;
            const condition = surfaces[zone.surface];
            return (
              <button
                key={zone.key}
                type="button"
                onClick={() => cycleSurface(zone.surface)}
                title={`${t(`emr.surface.${zone.surface}`)}: ${t(`emr.surfaceCondition.${condition}`)}`}
                className="flex aspect-square flex-col items-center justify-center rounded-md border border-slate-200 text-[10px] font-medium transition hover:scale-105 dark:border-slate-700"
                style={{ backgroundColor: SURFACE_CONDITION_HEX[condition] }}
              >
                <span className="leading-tight text-slate-700 dark:text-slate-100">{t(`emr.surface.${zone.surface}`)}</span>
                <span className="text-[9px] text-slate-500 dark:text-slate-300">{t(`emr.surfaceCondition.${condition}`)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{t('emr.tooth.surfaceHint')}</p>
      </div>

      <div className="flex-1">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.tooth.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20"
          placeholder={t('emr.tooth.notesPlaceholder')}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
