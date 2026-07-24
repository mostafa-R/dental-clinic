import { useState } from 'react';

import {
  PERMANENT_TEETH,
  TOOTH_STATE_STYLES,
  SURFACE_CONDITIONS,
  SURFACE_CONDITION_LABELS,
} from './dental';
import { useT } from '../../lib/i18n';

const SLOT_W = 44;
const CROWN_W = 40;
const CROWN_H = 56;
const PAD_X = 16;
const TOP_Y = 44;
const BOTTOM_Y = 124;

const UPPER_TEETH = PERMANENT_TEETH.filter((t) => t.arch === 'upper');
const LOWER_TEETH = PERMANENT_TEETH.filter((t) => t.arch === 'lower');

const SURFACE_CONDITION_HEX = {
  sound: 'transparent',
  caries: '#fb7185',
  restored: '#38bdf8',
};

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

function surfaceFill(condition) {
  if (!condition || condition === 'sound') return 'transparent';
  return SURFACE_CONDITION_HEX[condition] || 'transparent';
}

function ToothCrown({ tooth, meta, numbering, selected, onSelect, onSurfaceClick, isUpper, planItems }) {
  const x = meta.x;
  const y = isUpper ? TOP_Y : BOTTOM_Y;
  const state = tooth?.state || 'sound';
  const isMissing = state === 'missing';
  const labelY = isUpper ? TOP_Y - 10 : BOTTOM_Y + CROWN_H + 16;
  const surfaces = tooth?.surfaces || {};

  const handleClick = (e, surface) => {
    e.stopPropagation();
    if (onSurfaceClick && surface) {
      onSurfaceClick(meta.universal, surface);
    }
  };

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

          {/* Surface paths — clickable regions */}
          {/* Buccal — top band */}
          <path
            d={`M${x + 6} ${y + 2} L${x + CROWN_W - 6} ${y + 2} Q${x + CROWN_W - 2} ${y + 2} ${x + CROWN_W - 2} ${y + 6} L${x + CROWN_W - 2} ${y + 16} L${x + 2} ${y + 16} L${x + 2} ${y + 6} Q${x + 2} ${y + 2} ${x + 6} ${y + 2} Z`}
            fill={surfaceFill(surfaces.buccal)}
            fillOpacity={0.7}
            stroke={surfaces.buccal && surfaces.buccal !== 'sound' ? surfaces.buccal === 'caries' ? '#fb7185' : '#38bdf8' : 'transparent'}
            strokeWidth={surfaces.buccal && surfaces.buccal !== 'sound' ? 1 : 0}
            onClick={(e) => handleClick(e, 'buccal')}
            className="cursor-pointer transition-opacity hover:fill-opacity-100"
          />
          {/* Lingual — bottom band */}
          <path
            d={`M${x + 2} ${y + CROWN_H - 16} L${x + CROWN_W - 2} ${y + CROWN_H - 16} L${x + CROWN_W - 2} ${y + CROWN_H - 6} Q${x + CROWN_W - 2} ${y + CROWN_H - 2} ${x + CROWN_W - 6} ${y + CROWN_H - 2} L${x + 6} ${y + CROWN_H - 2} Q${x + 2} ${y + CROWN_H - 2} ${x + 2} ${y + CROWN_H - 6} Z`}
            fill={surfaceFill(surfaces.lingual)}
            fillOpacity={0.7}
            stroke={surfaces.lingual && surfaces.lingual !== 'sound' ? surfaces.lingual === 'caries' ? '#fb7185' : '#38bdf8' : 'transparent'}
            strokeWidth={surfaces.lingual && surfaces.lingual !== 'sound' ? 1 : 0}
            onClick={(e) => handleClick(e, 'lingual')}
            className="cursor-pointer transition-opacity hover:fill-opacity-100"
          />
          {/* Mesial — left strip */}
          <path
            d={`M${x + 2} ${y + 16} L${x + 14} ${y + 16} L${x + 14} ${y + CROWN_H - 16} L${x + 2} ${y + CROWN_H - 16} Z`}
            fill={surfaceFill(surfaces.mesial)}
            fillOpacity={0.7}
            stroke={surfaces.mesial && surfaces.mesial !== 'sound' ? surfaces.mesial === 'caries' ? '#fb7185' : '#38bdf8' : 'transparent'}
            strokeWidth={surfaces.mesial && surfaces.mesial !== 'sound' ? 1 : 0}
            onClick={(e) => handleClick(e, 'mesial')}
            className="cursor-pointer transition-opacity hover:fill-opacity-100"
          />
          {/* Distal — right strip */}
          <path
            d={`M${x + CROWN_W - 14} ${y + 16} L${x + CROWN_W - 2} ${y + 16} L${x + CROWN_W - 2} ${y + CROWN_H - 16} L${x + CROWN_W - 14} ${y + CROWN_H - 16} Z`}
            fill={surfaceFill(surfaces.distal)}
            fillOpacity={0.7}
            stroke={surfaces.distal && surfaces.distal !== 'sound' ? surfaces.distal === 'caries' ? '#fb7185' : '#38bdf8' : 'transparent'}
            strokeWidth={surfaces.distal && surfaces.distal !== 'sound' ? 1 : 0}
            onClick={(e) => handleClick(e, 'distal')}
            className="cursor-pointer transition-opacity hover:fill-opacity-100"
          />
          {/* Occlusal — center rectangle */}
          <path
            d={`M${x + 14} ${y + 16} L${x + CROWN_W - 14} ${y + 16} L${x + CROWN_W - 14} ${y + CROWN_H - 16} L${x + 14} ${y + CROWN_H - 16} Z`}
            fill={surfaceFill(surfaces.occlusal)}
            fillOpacity={0.7}
            stroke={surfaces.occlusal && surfaces.occlusal !== 'sound' ? surfaces.occlusal === 'caries' ? '#fb7185' : '#38bdf8' : 'transparent'}
            strokeWidth={surfaces.occlusal && surfaces.occlusal !== 'sound' ? 1 : 0}
            onClick={(e) => handleClick(e, 'occlusal')}
            className="cursor-pointer transition-opacity hover:fill-opacity-100"
          />

          {/* Surface border lines for visual clarity */}
          <line x1={x + 14} y1={y + 16} x2={x + 14} y2={y + CROWN_H - 16} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.5} />
          <line x1={x + CROWN_W - 14} y1={y + 16} x2={x + CROWN_W - 14} y2={y + CROWN_H - 16} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.5} />
          <line x1={x + 2} y1={y + 16} x2={x + CROWN_W - 2} y2={y + 16} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.5} />
          <line x1={x + 2} y1={y + CROWN_H - 16} x2={x + CROWN_W - 2} y2={y + CROWN_H - 16} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.5} />

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

export default function DentalChart({ teeth, selectedNumber, onSelect, onSurfaceClick, planItemsByTooth }) {
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
          <line x1={PAD_X} y1={(TOP_Y + CROWN_H + BOTTOM_Y) / 2} x2={width - PAD_X} y2={(TOP_Y + CROWN_H + BOTTOM_Y) / 2} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="2 4" />
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
              onSurfaceClick={onSurfaceClick}
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
              onSurfaceClick={onSurfaceClick}
              planItems={planItemsByTooth?.[meta.universal]}
            />
          ))}
        </svg>
      </div>

      <Legend t={t} />
    </div>
  );
}
