import type { Material, Profile } from './types';

const numberFormatterCache = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  let formatter = numberFormatterCache.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits,
      minimumFractionDigits: 0,
    });
    numberFormatterCache.set(maximumFractionDigits, formatter);
  }
  return formatter.format(value);
}

export function formatMm(value: number): string {
  return `${formatNumber(value, 2)} mm`;
}

export function formatPercent(fraction: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${formatNumber(fraction * 100, maximumFractionDigits)}%`;
}

export function formatWeight(kg: number): string {
  return `${formatNumber(kg, 2)} kg`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function profileLabel(profile: Profile): string {
  switch (profile) {
    case 'round':
      return '圆管';
    case 'square':
      return '方管';
    case 'rect':
      return '矩形管';
  }
}

export function formatMaterialSpec(
  material: Pick<Material, 'profile' | 'outerDiameter' | 'width' | 'height' | 'wallThickness' | 'length'>,
  includeLength = true,
): string {
  const wall = formatNumber(material.wallThickness, 2);
  let base: string;
  switch (material.profile) {
    case 'round':
      base = `Φ${formatNumber(material.outerDiameter, 2)}×${wall}`;
      break;
    case 'square':
      base = `□${formatNumber(material.width, 2)}×${wall}`;
      break;
    case 'rect':
      base = `▭${formatNumber(material.width, 2)}×${formatNumber(material.height, 2)}×${wall}`;
      break;
  }
  return includeLength ? `${base}×${formatNumber(material.length, 2)}` : base;
}

export function formatPartSize(length: number): string {
  return `${formatNumber(length, 2)} mm`;
}

/** Cross-section area in mm². */
export function tubeAreaMm2(
  material: Pick<Material, 'profile' | 'outerDiameter' | 'width' | 'height' | 'wallThickness'>,
): number {
  const t = material.wallThickness;
  if (t <= 0) return 0;
  switch (material.profile) {
    case 'round': {
      if (material.outerDiameter <= t * 2) return 0;
      return Math.PI * t * (material.outerDiameter - t);
    }
    case 'square': {
      if (material.width <= t * 2) return 0;
      return 4 * t * (material.width - t);
    }
    case 'rect': {
      if (material.width <= t * 2 || material.height <= t * 2) return 0;
      return 2 * t * (material.width + material.height - 2 * t);
    }
  }
}

/** Estimated weight in kg for a given cut length. */
export function tubeWeightKg(
  material: Pick<
    Material,
    'profile' | 'outerDiameter' | 'width' | 'height' | 'wallThickness' | 'density'
  >,
  lengthMm: number,
): number {
  const area = tubeAreaMm2(material);
  if (area <= 0 || lengthMm <= 0 || material.density <= 0) return 0;
  return (area * lengthMm * material.density) / 1_000_000;
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || '管切算'
  );
}

export function todayStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
