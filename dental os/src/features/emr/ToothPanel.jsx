import { useEffect, useState } from 'react';

import {
  TOOTH_STATES,
  SURFACES,
  SURFACE_LABELS,
  SURFACE_CONDITIONS,
  SURFACE_CONDITION_LABELS,
  describeTooth,
  toothStyle,
} from './dental';
import { useT } from '../../lib/i18n';

const SURFACE_CONDITION_HEX = {
  sound: '#e2e8f0',
  caries: '#fb7185',
  restored: '#38bdf8',
};

const CONDITION_BORDER = {
  sound: 'border-slate-300 dark:border-slate-600',
  caries: 'border-rose-400 dark:border-rose-500',
  restored: 'border-sky-400 dark:border-sky-500',
};

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

function SurfaceRow({ surface, condition, onChange }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs font-medium text-slate-600 dark:text-slate-300">
        {SURFACE_LABELS[surface]}
      </span>
      <div className="flex gap-1">
        {SURFACE_CONDITIONS.map((cond) => (
          <button
            key={cond}
            type="button"
            onClick={() => onChange(cond)}
            title={`${SURFACE_LABELS[surface]}: ${SURFACE_CONDITION_LABELS[cond]}`}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              condition === cond
                ? `${CONDITION_BORDER[cond]} bg-opacity-100 ring-1 ring-offset-1 dark:ring-offset-slate-800`
                : 'border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
            }`}
            style={
              condition === cond
                ? { backgroundColor: SURFACE_CONDITION_HEX[cond], color: cond === 'sound' ? '#475569' : cond === 'caries' ? '#be123c' : '#0369a1' }
                : undefined
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SURFACE_CONDITION_HEX[cond] }} />
            {SURFACE_CONDITION_LABELS[cond]}
          </button>
        ))}
      </div>
    </div>
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

  const setSurface = (surface, condition) => {
    setSurfaces((prev) => ({ ...prev, [surface]: condition }));
  };

  const hasCaries = Object.values(surfaces).some((c) => c === 'caries');
  const hasRestorations = Object.values(surfaces).some((c) => c === 'restored');
  const affectedSurfaces = Object.entries(surfaces)
    .filter(([, c]) => c !== 'sound')
    .map(([s]) => s);

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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.tooth.surfaces')}</p>
          {affectedSurfaces.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {affectedSurfaces.length} affected
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {SURFACES.map((surface) => (
            <SurfaceRow
              key={surface}
              surface={surface}
              condition={surfaces[surface]}
              onChange={(cond) => setSurface(surface, cond)}
            />
          ))}
        </div>
        {(hasCaries || hasRestorations) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {hasCaries && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                {Object.values(surfaces).filter((c) => c === 'caries').length} caries
              </span>
            )}
            {hasRestorations && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {Object.values(surfaces).filter((c) => c === 'restored').length} restored
              </span>
            )}
          </div>
        )}
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
