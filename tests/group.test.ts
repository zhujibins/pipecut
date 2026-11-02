import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../shared/optimizer';
import { formatBarRange, groupBars } from '../shared/group';
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

describe('groupBars', () => {
  it('merges repeated identical bars and keeps all bar numbers', () => {
    const result = calculatePlan({
      materials: [material()],
      parts: [part()],
      items: [{ partId: 1, quantity: 10 }],
      cutMethod: 'laser',
      kerfMm: 1.5,
      now: '2026-01-02T03:04:05.000Z',
    });

    expect(result.bars).toHaveLength(2);
    const groups = groupBars(result.bars);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].barNos).toEqual([1, 2]);
    expect(groups[0].totalWeightKg).toBeCloseTo(result.bars[0].weightKg * 2, 5);
    expect(groups[0].totalLeftoverLength).toBeCloseTo(
      result.bars[0].leftoverLength + result.bars[1].leftoverLength,
      5,
    );
    expect(formatBarRange(groups[0].barNos)).toBe('#01–#02');
  });

  it('does not merge bars from different materials', () => {
    const result = calculatePlan({
      materials: [
        material({ id: 1, code: 'M-001' }),
        material({ id: 2, code: 'M-002', outerDiameter: 42, wallThickness: 2 }),
      ],
      parts: [
        part({ id: 1, code: 'P-001', materialId: 1 }),
        part({ id: 2, code: 'P-002', materialId: 2 }),
      ],
      items: [
        { partId: 1, quantity: 5 },
        { partId: 2, quantity: 5 },
      ],
      cutMethod: 'laser',
      kerfMm: 1.5,
      now: '2026-01-02T03:04:05.000Z',
    });

    expect(result.bars).toHaveLength(2);
    expect(groupBars(result.bars)).toHaveLength(2);
  });

  it('formats contiguous and scattered bar numbers', () => {
    expect(formatBarRange([1])).toBe('#01');
    expect(formatBarRange([1, 2, 3])).toBe('#01–#03');
    expect(formatBarRange([1, 3])).toBe('#01、#03');
    expect(formatBarRange([1, 2, 3, 4, 5])).toBe('#01–#05');
  });
});
