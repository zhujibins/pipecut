import type { BarPlan } from './types';

export interface BarPatternGroup {
  key: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  spec: string;
  grade: string;
  sample: BarPlan;
  count: number;
  barNos: number[];
  totalWeightKg: number;
  totalLeftoverLength: number;
  totalKerfTotal: number;
}

function patternKey(bar: BarPlan): string {
  const pieces = bar.pieces
    .map((piece) => `${piece.partId}:${piece.length}`)
    .sort()
    .join('|');
  return [
    bar.materialId,
    bar.stockLength,
    bar.clampLength,
    bar.kerfTotal,
    pieces,
  ].join('#');
}

/**
 * Merge bars that have exactly the same material and the same set of cut
 * pieces. The first bar becomes the visual sample, while count/barNos keep
 * traceability to every physical stock bar.
 */
export function groupBars(bars: BarPlan[]): BarPatternGroup[] {
  const groups = new Map<string, BarPatternGroup>();

  for (const bar of bars) {
    const key = patternKey(bar);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.barNos.push(bar.barNo);
      existing.totalWeightKg += bar.weightKg;
      existing.totalLeftoverLength += bar.leftoverLength;
      existing.totalKerfTotal += bar.kerfTotal;
      continue;
    }

    groups.set(key, {
      key,
      materialId: bar.materialId,
      materialCode: bar.materialCode,
      materialName: bar.materialName,
      spec: bar.spec,
      grade: bar.grade,
      sample: bar,
      count: 1,
      barNos: [bar.barNo],
      totalWeightKg: bar.weightKg,
      totalLeftoverLength: bar.leftoverLength,
      totalKerfTotal: bar.kerfTotal,
    });
  }

  return [...groups.values()];
}

function padBarNo(barNo: number): string {
  return `#${String(barNo).padStart(2, '0')}`;
}

export function formatBarRange(barNos: number[]): string {
  const sorted = [...new Set(barNos)].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  if (sorted.length === 1) return padBarNo(sorted[0]);

  const contiguous = sorted.every((barNo, index) => index === 0 || barNo === sorted[index - 1] + 1);
  if (contiguous) {
    return `${padBarNo(sorted[0])}–${padBarNo(sorted[sorted.length - 1])}`;
  }
  if (sorted.length <= 4) return sorted.map(padBarNo).join('、');
  return `${sorted.slice(0, 3).map(padBarNo).join('、')}…（共 ${sorted.length} 根）`;
}
