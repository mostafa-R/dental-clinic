import { useState } from 'react';

import {
  PERMANENT_TEETH,
  TOOTH_STATE_STYLES,
} from '../../lib/dental';
import { useT } from '../../lib/i18n';

const SLOT_W = 44;
const CROWN_W = 40;
const CROWN_H = 56;
const PAD_X = 16;
const TOP_Y = 44;
const BOTTOM_Y = 124;

const UPPER_TEETH = PERMANENT_TEETH.filter((t) => t.arch === 'upper'); // 1..16
const LOWER_TEETH = PERMANENT_TEETH.filter((t) => t.arch === 'lower'); // 17..32

function notationLabel(meta, numbering) {
  if (!meta) return '';
  if (numbering === 'palmer') return meta.palmerNotation;
  if (numbering === 'fdi') return String(meta.fdi);
  return String(meta.universal);
}

function crownFill(state) {
  return (TOOTH_STATE_STYLES[state] || TOOTH_STATE_STYLES.sound).hex;
}

const PROCEDURE_DOT_COLORS = {
  pending: '#f97316',
  in_progress: '#3b82f6',
  completed: '#22c55e',
};

function surfaceDot(surface) {
  const colors = { caries: '#fb7185', restored: '#38bdf8' };
  const color = colors[surface];
  if (!color || surface === 'sound') return null;
  return color;
}

function ToothCrown({ tooth, meta, numbering, selected, onSelect, isUpper, planItems }) {
  const x = meta.x;
  const y = isUpper ? TOP_Y : BOTTOM_Y;
  const state = tooth?.state || 'sound';
  const isMissing = state === 'missing';
  const labelY = isUpper ? TOP_Y - 10 : BOTTOM_Y + CROWN_H + 16;

  return (
    <g className="cursor-pointer" onClick={() => onSelect(meta.universal)}>
      <rect
        x={x}
        y={y}
        width={CROWN_W}
        height={CROWN_H}
        rx={9}
        fill={isMissing ? '#fff' : crownFill(state)}
        stroke={selected ? '#4f46e5' : '#cbd5e1'}
        strokeWidth={selected ? 3 : 1.5}
        strokeDasharray={isMissing ? '4 3' : undefined}
        className="transition-all"
      />
      {!isMissing && (
        <>
          <path
            d={`M${x + 6} ${y + 18} q${CROWN_W / 2 - 6} 6 ${CROWN_W - 12} 0`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.6}
            strokeWidth={2}
          />
          {tooth?.surfaces && (
            <>
              {surfaceDot(tooth.surfaces.mesial) && (
                <circle cx={x + 4} cy={y + CROWN_H / 2} r={3} fill={surfaceDot(tooth.surfaces.mesial)} />
              )}
              {surfaceDot(tooth.surfaces.distal) && (
                <circle cx={x + CROWN_W - 4} cy={y + CROWN_H / 2} r={3} fill={surfaceDot(tooth.surfaces.distal)} />
              )}
              {surfaceDot(tooth.surfaces.buccal) && (
                <circle cx={x + CROWN_W / 2} cy={y + 10} r={3} fill={surfaceDot(tooth.surfaces.buccal)} />
              )}
              {surfaceDot(tooth.surfaces.lingual) && (
                <circle cx={x + CROWN_W / 2} cy={y + CROWN_H - 10} r={3} fill={surfaceDot(tooth.surfaces.lingual)} />
              )}
              {surfaceDot(tooth.surfaces.occlusal) && (
                <circle cx={x + CROWN_W / 2} cy={y + CROWN_H / 2} r={3} fill={surfaceDot(tooth.surfaces.occlusal)} />
              )}
            </>
          )}
          {planItems && planItems.length > 0 && (
            <g>
              {planItems.map((item, i) => (
                <circle key={i} cx={x + CROWN_W - 6} cy={y + 8 + i * 6} r={2.5} fill={PROCEDURE_DOT_COLORS[item.status] || '#94a3b8'} stroke="#fff" strokeWidth={1} />
              ))}
            </g>
          )}
        </>
      )}
      {isMissing && (
        <path
          d={`M${x + 10} ${y + 16} l${CROWN_W - 20} ${CROWN_H - 32} M${x + CROWN_W - 10} ${y + 16} l${-CROWN_W + 20} ${CROWN_H - 32}`}
          stroke="#94a3b8"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <text x={x + CROWN_W / 2} y={labelY} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 11, fontWeight: 600 }}>
        {notationLabel(meta, numbering)}
      </text>
    </g>
  );
}

function Legend({ t }) {
  const items = [
    ['sound', 'emr.state.sound'],
    ['caries', 'emr.state.caries'],
    ['filled', 'emr.state.filled'],
    ['crown', 'emr.state.crown'],
    ['root_canal', 'emr.state.root_canal'],
    ['implant', 'emr.state.implant'],
    ['missing', 'emr.state.missing'],
    ['extraction_scheduled', 'emr.state.extraction_scheduled'],
  ];
  const surfaceItems = [
    ['caries', '#fb7185', 'emr.surfaceCondition.caries'],
    ['restored', '#38bdf8', 'emr.surfaceCondition.restored'],
  ];
  const procedureItems = [
    ['pending', '#f97316', 'emr.procedure.status.pending'],
    ['in_progress', '#3b82f6', 'emr.procedure.status.in_progress'],
    ['completed', '#22c55e', 'emr.procedure.status.completed'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('emr.tooth.state')}</span>
      {items.map(([state, key]) => (
        <div key={state} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: crownFill(state) }} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{t(key)}</span>
        </div>
      ))}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('emr.tooth.surfaces')}</span>
      {surfaceItems.map(([cond, color, key]) => (
        <div key={cond} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{t(key)}</span>
        </div>
      ))}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('emr.plan.items')}</span>
      {procedureItems.map(([status, color, key]) => (
        <div key={status} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{t(key)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DentalChart({ teeth, selectedNumber, onSelect, planItemsByTooth }) {
  const { t } = useT();
  const [numbering, setNumbering] = useState('universal');

  const byNumber = new Map((teeth || []).map((t) => [t.number, t]));

  const upper = UPPER_TEETH.map((meta, i) => ({ meta: { ...meta, x: PAD_X + i * SLOT_W }, isUpper: true }));
  const lower = LOWER_TEETH.slice()
    .reverse()
    .map((meta, i) => ({ meta: { ...meta, x: PAD_X + i * SLOT_W }, isUpper: false }));

  const width = PAD_X * 2 + 16 * SLOT_W;
  const viewBox = `0 0 ${width} 220`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {[
            ['universal', 'emr.numbering.universal'],
            ['palmer', 'emr.numbering.palmer'],
            ['fdi', 'emr.numbering.fdi'],
          ].map(([value, key]) => (
            <button
              key={value}
              type="button"
              onClick={() => setNumbering(value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                numbering === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">{t('emr.chart.hint')}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={viewBox} className="h-auto w-full min-w-[680px]" role="img" aria-label={t('emr.chart.aria')}>
          {/* Midline */}
          <line x1={PAD_X} y1={(TOP_Y + CROWN_H + BOTTOM_Y) / 2} x2={width - PAD_X} y2={(TOP_Y + CROWN_H + BOTTOM_Y) / 2} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="2 4" />
          {/* Quadrant labels */}
          <text x={PAD_X + 4} y={34} className="fill-slate-300 dark:fill-slate-600" style={{ fontSize: 9, fontWeight: 700 }}>{t('emr.quadrant.ur')}</text>
          <text x={width - PAD_X - 4} y={34} textAnchor="end" className="fill-slate-300 dark:fill-slate-600" style={{ fontSize: 9, fontWeight: 700 }}>{t('emr.quadrant.ul')}</text>
          <text x={PAD_X + 4} y={212} className="fill-slate-300 dark:fill-slate-600" style={{ fontSize: 9, fontWeight: 700 }}>{t('emr.quadrant.lr')}</text>
          <text x={width - PAD_X - 4} y={212} textAnchor="end" className="fill-slate-300 dark:fill-slate-600" style={{ fontSize: 9, fontWeight: 700 }}>{t('emr.quadrant.ll')}</text>

          {upper.map(({ meta, isUpper }) => (
            <ToothCrown
              key={meta.universal}
              tooth={byNumber.get(meta.universal)}
              meta={meta}
              numbering={numbering}
              isUpper={isUpper}
              selected={selectedNumber === meta.universal}
              onSelect={onSelect}
              planItems={planItemsByTooth?.[meta.universal]}
            />
          ))}
          {lower.map(({ meta, isUpper }) => (
            <ToothCrown
              key={meta.universal}
              tooth={byNumber.get(meta.universal)}
              meta={meta}
              numbering={numbering}
              isUpper={isUpper}
              selected={selectedNumber === meta.universal}
              onSelect={onSelect}
              planItems={planItemsByTooth?.[meta.universal]}
            />
          ))}
        </svg>
      </div>

      <Legend t={t} />
    </div>
  );
}
