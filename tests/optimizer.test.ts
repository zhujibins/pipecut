import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../shared/optimizer';
import { tubeWeightKg } from '../shared/format';
import type { Material, Part } from '../shared/types';

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: 1,
    code: 'M-001',
    name: '碳钢无缝管',
    profile: 'round',
    outerDiameter: 60,
    width: 0,
    height: 0,
    wallThickness: 3,
    length: 6000,
    grade: '20#',
    density: 7.85,
    quantity: 10,
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function part(overrides: Partial<Part> = {}): Part {
  return {
    id: 1,
    code: 'P-001',
    name: '横梁',
    materialId: 1,
    length: 1000,
    quantity: 1,
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function run(
  items: { partId: number; quantity: number }[],
  options: {
    cutMethod?: 'laser' | 'saw';
    kerfMm?: number;
    materials?: Material[];
    parts?: Part[];
  } = {},
) {
  return calculatePlan({
    materials: options.materials ?? [material()],
    parts: options.parts ?? [part()],
    items,
    cutMethod: options.cutMethod ?? 'laser',
    kerfMm: options.kerfMm ?? 1.5,
    now: '2026-01-02T03:04:05.000Z',
  });
}

describe('calculatePlan', () => {
  it('reserves 200 mm for laser clamping and counts kerf per cut', () => {
    const result = run([{ partId: 1, quantity: 2 }], {
      materials: [material()],
      parts: [part({ length: 2900 })],
      cutMethod: 'laser',
      kerfMm: 1.5,
    });

    expect(result.clampMm).toBe(200);
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0].usableLength).toBe(5800);
    expect(result.bars[0].segments.at(-1)?.kind).toBe('clamp');
    expect(result.bars[0].leftoverLength).toBeGreaterThan(0);
  });

  it('uses the full bar for saw cutting with no clamp reserve', () => {
    const result = run([{ partId: 1, quantity: 2 }], {
      materials: [material()],
      parts: [part({ length: 2900 })],
      cutMethod: 'saw',
      kerfMm: 4,
    });

    expect(result.clampMm).toBe(0);
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0].usedLength).toBe(5808);
    expect(result.bars[0].segments.some((segment) => segment.kind === 'clamp')).toBe(false);
  });

  it('counts saw kerf and opens a second bar when three pieces no longer fit', () => {
    const result = run([{ partId: 1, quantity: 3 }], {
      materials: [material()],
      parts: [part({ length: 2000 })],
      cutMethod: 'saw',
      kerfMm: 4,
    });

    expect(result.bars).toHaveLength(2);
    expect(result.bars[0].pieces).toHaveLength(2);
    expect(result.bars[1].pieces).toHaveLength(1);
    expect(result.totals.kerfTotal).toBe(12);
  });

  it('reports inventory shortage while still producing the full plan', () => {
    const result = run([{ partId: 1, quantity: 2 }], {
      materials: [material({ quantity: 1 })],
      parts: [part({ length: 3000 })],
    });

    expect(result.bars).toHaveLength(2);
    expect(result.summaries[0].requiredBars).toBe(2);
    expect(result.summaries[0].shortageBars).toBe(1);
    expect(result.warnings.join(' ')).toContain('库存不足');
  });

  it('moves a part that is longer than the usable length into unplaced', () => {
    const result = run([{ partId: 1, quantity: 2 }], {
      materials: [material()],
      parts: [part({ length: 5900 })],
    });

    expect(result.bars).toHaveLength(0);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0].quantity).toBe(2);
    expect(result.totals.stockCount).toBe(0);
  });

  it('calculates estimated round and square tube weights', () => {
    const round = tubeWeightKg(
      { profile: 'round', outerDiameter: 60, width: 0, height: 0, wallThickness: 3, density: 7.85 },
      1000,
    );
    const square = tubeWeightKg(
      { profile: 'square', outerDiameter: 0, width: 40, height: 40, wallThickness: 2, density: 7.85 },
      1000,
    );

    expect(round).toBeCloseTo(4.217, 2);
    expect(square).toBeCloseTo(2.386, 2);
  });

  it('keeps a complete segment layout with clamp at the held end', () => {
    const result = run([{ partId: 1, quantity: 1 }], {
      parts: [part({ length: 1000 })],
    });
    const segments = result.bars[0].segments;

    expect(segments[0]).toMatchObject({ kind: 'part', start: 0, end: 1000 });
    expect(segments[1]).toMatchObject({ kind: 'kerf', start: 1000, end: 1001.5 });
    expect(segments[2]).toMatchObject({ kind: 'leftover', start: 1001.5, end: 5800 });
    expect(segments[3]).toMatchObject({ kind: 'clamp', start: 5800, end: 6000 });
  });

  it('packs mixed lengths into the minimum number of bars for a simple case', () => {
    const parts = [
      part({ id: 1, code: 'P-001', length: 2500 }),
      part({ id: 2, code: 'P-002', length: 2500 }),
      part({ id: 3, code: 'P-003', length: 1000 }),
      part({ id: 4, code: 'P-004', length: 1000 }),
      part({ id: 5, code: 'P-005', length: 1000 }),
      part({ id: 6, code: 'P-006', length: 1000 }),
    ];
    const result = calculatePlan({
      materials: [material()],
      parts,
      items: parts.map((entry) => ({ partId: entry.id, quantity: 1 })),
      cutMethod: 'saw',
      kerfMm: 0.1,
      now: '2026-01-02T03:04:05.000Z',
    });

    expect(result.bars).toHaveLength(2);
    expect(result.totals.pieceCount).toBe(6);
    expect(result.totals.utilization).toBeCloseTo(0.75, 5);
  });

  it('groups different material specs independently', () => {
    const steel = material({ id: 1, code: 'M-001', grade: '20#' });
    const stainless = material({
      id: 2,
      code: 'M-002',
      name: '304 管',
      grade: '304',
      density: 7.93,
      outerDiameter: 42,
      wallThickness: 2,
    });
    const result = calculatePlan({
      materials: [steel, stainless],
      parts: [
        part({ id: 1, code: 'P-001', materialId: 1, length: 2000 }),
        part({ id: 2, code: 'P-002', materialId: 2, length: 2000 }),
      ],
      items: [
        { partId: 1, quantity: 2 },
        { partId: 2, quantity: 2 },
      ],
      cutMethod: 'laser',
      kerfMm: 1,
      now: '2026-01-02T03:04:05.000Z',
    });

    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0].materialCode).toBe('M-001');
    expect(result.summaries[1].materialCode).toBe('M-002');
    expect(result.bars).toHaveLength(2);
  });
});
