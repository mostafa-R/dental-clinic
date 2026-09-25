// @vitest-environment node
/**
 * S1b — frontend FDI adoption: pure unit tests for the centralized tooth-code
 * mapper (`features/emr/dental.js`). Node environment on purpose: this module
 * is dependency-free, so the slice needs neither jsdom nor a UI framework.
 */
import { describe, expect, it } from 'vitest';

import {
  FDI_TOOTH_OPTIONS,
  describeTooth,
  fdiToUniversal,
  formatToothLabel,
  isExternalAttachmentUrl,
  isValidAttachmentUrl,
  isValidFdi,
  toothChartPayload,
  toothFdi,
  toothRouteCode,
  toothUniversal,
  universalToFdi,
} from './dental';

describe('universal <-> FDI conversion', () => {
  it('maps Universal 1 to FDI 18', () => {
    expect(universalToFdi(1)).toBe(18);
    expect(fdiToUniversal(18)).toBe(1);
  });

  it('maps Universal 16 to FDI 28', () => {
    expect(universalToFdi(16)).toBe(28);
    expect(fdiToUniversal(28)).toBe(16);
  });

  it('maps Universal 17 to FDI 38', () => {
    expect(universalToFdi(17)).toBe(38);
    expect(fdiToUniversal(38)).toBe(17);
  });

  it('maps Universal 32 to FDI 48', () => {
    expect(universalToFdi(32)).toBe(48);
    expect(fdiToUniversal(48)).toBe(32);
  });

  it('round-trips all 32 permanent teeth in both directions', () => {
    for (let u = 1; u <= 32; u++) {
      const fdi = universalToFdi(u);
      expect(isValidFdi(fdi)).toBe(true);
      expect(fdiToUniversal(fdi)).toBe(u);
      expect(describeTooth(u).fdi).toBe(fdi);
    }
  });
});

describe('primary teeth mapping', () => {
  it('never coerces primary-dentition FDI codes (51-85) into permanent teeth', () => {
    for (const code of [51, 55, 61, 65, 71, 75, 81, 85]) {
      expect(isValidFdi(code)).toBe(false);
      expect(fdiToUniversal(code)).toBeNull();
      expect(toothFdi({ fdi: code })).toBeNull();
      expect(toothUniversal({ fdi: code })).toBeNull();
    }
  });
});

describe('invalid tooth values', () => {
  it('rejects out-of-range, non-integer, and non-numeric codes', () => {
    for (const bad of [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 99, 11.5, 'abc', '', null, undefined]) {
      expect(isValidFdi(bad)).toBe(false);
      expect(fdiToUniversal(bad)).toBeNull();
    }
    expect(universalToFdi(0)).toBeNull();
    expect(universalToFdi(33)).toBeNull();
    expect(toothFdi(null)).toBeNull();
    expect(toothFdi({})).toBeNull();
    expect(toothUniversal(null)).toBeNull();
  });
});

describe('canonical tooth identity', () => {
  it('prefers an explicit valid fdi over a legacy number', () => {
    expect(toothFdi({ fdi: 28, number: 1 })).toBe(28);
    expect(toothUniversal({ fdi: 28, number: 1 })).toBe(16);
  });

  it('derives FDI from legacy number-only responses', () => {
    expect(toothFdi({ number: 16 })).toBe(28);
    expect(toothFdi({ number: 16, state: 'caries' })).toBe(28);
  });

  it('derives Universal from FDI-only responses', () => {
    expect(toothUniversal({ fdi: 11 })).toBe(8);
  });
});

describe('API payload behavior', () => {
  it('sends an explicit fdi with no conflicting number', () => {
    const payload = toothChartPayload({ number: 16, fdi: 28 }, { state: 'caries' });
    expect(payload).toEqual({ fdi: 28, state: 'caries' });
    expect(payload).not.toHaveProperty('number');
    expect(payload).not.toHaveProperty('tooth');
  });

  it('derives fdi for legacy number-only teeth (backward compat)', () => {
    const payload = toothChartPayload({ number: 16 }, { state: 'filled' });
    expect(payload.fdi).toBe(28);
    expect(payload).not.toHaveProperty('number');
  });

  it('derives the legacy Universal route code centrally, never a bare FDI', () => {
    // FDI 11-32 overlap numerically with Universal 1-32 and would misroute.
    expect(toothRouteCode({ fdi: 28 })).toBe(16);
    expect(toothRouteCode({ fdi: 48 })).toBe(32);
    expect(toothRouteCode({ number: 16, fdi: 28 })).toBe(16);
  });
});

describe('display helpers', () => {
  it('labels plan items with canonical FDI, falling back for legacy data', () => {
    expect(formatToothLabel({ fdi: 28, tooth: 16 })).toBe('#28');
    expect(formatToothLabel({ tooth: 16 })).toBe('#28');
    expect(formatToothLabel({ tooth: null })).toBe('—');
    expect(formatToothLabel(null)).toBe('—');
  });

  it('exposes one shared FDI dropdown (empty option + 32 codes)', () => {
    expect(FDI_TOOTH_OPTIONS).toHaveLength(33);
    expect(FDI_TOOTH_OPTIONS[0]).toEqual({ value: '', label: '—' });
    const values = FDI_TOOTH_OPTIONS.slice(1).map((o) => Number(o.value));
    expect(values).toHaveLength(32);
    for (const v of values) expect(isValidFdi(v)).toBe(true);
    expect(values).toContain(18);
    expect(values).toContain(28);
    expect(values).toContain(48);
  });
});

describe('attachment URL validation', () => {
  it('accepts the server-issued encrypted download path', () => {
    expect(isValidAttachmentUrl('/api/v1/emr/attachments/abc-123.jpg/download')).toBe(true);
  });

  it('accepts an absolute https link', () => {
    expect(isValidAttachmentUrl('https://cdn.example.com/xray.jpg')).toBe(true);
    expect(isValidAttachmentUrl('HTTPS://CDN.EXAMPLE.COM/xray.jpg')).toBe(true);
  });

  it('rejects script-injection and other executable schemes', () => {
    // Mirrors server/modules/emr/emr.validator.js — a note must never be able
    // to carry a javascript:/data: link that the timeline renders as an href.
    expect(isValidAttachmentUrl('javascript:alert(1)')).toBe(false);
    expect(isValidAttachmentUrl('JavaScript:alert(1)')).toBe(false);
    expect(isValidAttachmentUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isValidAttachmentUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects plain http, protocol-relative and relative paths', () => {
    expect(isValidAttachmentUrl('http://cdn.example.com/xray.jpg')).toBe(false);
    expect(isValidAttachmentUrl('//cdn.example.com/xray.jpg')).toBe(false);
    expect(isValidAttachmentUrl('uploads/xray.jpg')).toBe(false);
  });

  it('rejects empty / whitespace-only references', () => {
    expect(isValidAttachmentUrl('')).toBe(false);
    expect(isValidAttachmentUrl('   ')).toBe(false);
    expect(isValidAttachmentUrl(null)).toBe(false);
    expect(isValidAttachmentUrl(undefined)).toBe(false);
  });

  it('flags only third-party hosts as external', () => {
    expect(isExternalAttachmentUrl('https://cdn.example.com/xray.jpg')).toBe(true);
    expect(isExternalAttachmentUrl('/api/v1/emr/attachments/a.jpg/download')).toBe(false);
  });
});
