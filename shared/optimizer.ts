import { formatMaterialSpec, tubeWeightKg } from './format';
import {
  METHOD_RULES,
  type BarPiece,
  type BarPlan,
  type BarSegment,
  type CutMethod,
  type Material,
  type MaterialPlanSummary,
  type Part,
  type PlanItemInput,
  type PlanResult,
  type UnplacedPiece,
} from './types';

const EPS = 1e-7;
const LENGTH_DIGITS = 3;

function r3(value: number): number {
  const factor = 10 ** LENGTH_DIGITS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function requiredOf(part: Part, kerfMm: number): number {
  return part.length + kerfMm;
}

interface PackedBin {
  pieces: Part[];
  used: number;
}

/**
 * Best-fit decreasing: place the longest remaining piece into the tightest
 * feasible bar. Good practical behaviour for workshop cut lists.
 */
function packBestFit(parts: Part[], capacity: number, kerfMm: number): PackedBin[] {
  const bins: PackedBin[] = [];
  for (const part of parts) {
    const required = requiredOf(part, kerfMm);
    let bestIndex = -1;
    let bestRemaining = Number.POSITIVE_INFINITY;
    for (let i = 0; i < bins.length; i += 1) {
      const remaining = capacity - bins[i].used;
      if (remaining + EPS >= required && remaining - required < bestRemaining) {
        bestRemaining = remaining - required;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      bins[bestIndex].pieces.push(part);
      bins[bestIndex].used += required;
    } else {
      bins.push({ pieces: [part], used: required });
    }
  }
  return bins;
}

/**
 * Try to empty the least-filled bars by redistributing their pieces. This is a
 * cheap improvement pass after best-fit decreasing and never worsens the plan.
 */
function reduceBins(input: PackedBin[], capacity: number, kerfMm: number): PackedBin[] {
  let current = input.map((bin) => ({ pieces: [...bin.pieces], used: bin.used }));
  if (current.length <= 1) return current;

  const totalUsed = current.reduce((sum, bin) => sum + bin.used, 0);
  const lowerBound = Math.max(1, Math.ceil(totalUsed / capacity - EPS));

  while (current.length > lowerBound) {
    let changed = false;
    const candidates = [...current].sort((a, b) => a.used - b.used);

    for (const target of candidates) {
      const trial = current
        .filter((bin) => bin !== target)
        .map((bin) => ({ pieces: [...bin.pieces], used: bin.used }));
      const moving = [...target.pieces].sort(
        (a, b) => requiredOf(b, kerfMm) - requiredOf(a, kerfMm),
      );
      let fits = true;

      for (const part of moving) {
        const required = requiredOf(part, kerfMm);
        let bestIndex = -1;
        let bestRemaining = Number.POSITIVE_INFINITY;
        for (let i = 0; i < trial.length; i += 1) {
          const remaining = capacity - trial[i].used;
          if (remaining + EPS >= required && remaining - required < bestRemaining) {
            bestRemaining = remaining - required;
            bestIndex = i;
          }
        }
        if (bestIndex < 0) {
          fits = false;
          break;
        }
        trial[bestIndex].pieces.push(part);
        trial[bestIndex].used += required;
      }

      if (fits) {
        current = trial;
        changed = true;
        break;
      }
    }

    if (!changed) break;
  }

  return current;
}

function buildBar(
  material: Material,
  bin: PackedBin,
  barNo: number,
  cutMethod: CutMethod,
  kerfMm: number,
): BarPlan {
  const clampLength = METHOD_RULES[cutMethod].clampMm;
  const stockLength = material.length;
  const usableLength = stockLength - clampLength;
  const ordered = [...bin.pieces].sort(
    (a, b) => b.length - a.length || a.code.localeCompare(b.code, 'zh-CN'),
  );

  const pieces: BarPiece[] = [];
  const segments: BarSegment[] = [];
  let position = 0;
  let partsLength = 0;
  let partWeightKg = 0;

  ordered.forEach((part, index) => {
    const sequence = index + 1;
    const start = position;
    const end = start + part.length;
    const weightKg = tubeWeightKg(material, part.length);

    segments.push({
      kind: 'part',
      start: r3(start),
      end: r3(end),
      length: r3(part.length),
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      sequence,
    });

    pieces.push({
      sequence,
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      length: part.length,
      weightKg,
    });

    position = end;
    segments.push({
      kind: 'kerf',
      start: r3(position),
      end: r3(position + kerfMm),
      length: r3(kerfMm),
    });
    position += kerfMm;
    partsLength += part.length;
    partWeightKg += weightKg;
  });

  const kerfTotal = r3(kerfMm * ordered.length);
  const usedLength = r3(partsLength + kerfTotal);
  const leftoverLength = r3(Math.max(0, usableLength - usedLength));

  if (leftoverLength > EPS) {
    segments.push({
      kind: 'leftover',
      start: r3(usedLength),
      end: r3(usableLength),
      length: leftoverLength,
    });
  }

  if (clampLength > 0) {
    segments.push({
      kind: 'clamp',
      start: r3(usableLength),
      end: r3(stockLength),
      length: r3(clampLength),
    });
  }

  return {
    barNo,
    materialId: material.id,
    materialCode: material.code,
    materialName: material.name,
    profile: material.profile,
    spec: formatMaterialSpec(material),
    grade: material.grade,
    stockLength: r3(stockLength),
    clampLength: r3(clampLength),
    usableLength: r3(usableLength),
    partsLength: r3(partsLength),
    kerfTotal,
    usedLength,
    leftoverLength,
    utilization: stockLength > 0 ? partsLength / stockLength : 0,
    weightKg: partWeightKg,
    pieces,
    segments,
  };
}

export function calculatePlan(params: {
  materials: Material[];
  parts: Part[];
  items: PlanItemInput[];
  cutMethod: CutMethod;
  kerfMm: number;
  now?: string;
}): PlanResult {
  const { materials, parts, items, cutMethod, kerfMm } = params;
  const clampMm = METHOD_RULES[cutMethod].clampMm;
  const partById = new Map(parts.map((part) => [part.id, part]));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const quantities = new Map<number, number>();
  const warnings = new Set<string>();
  const unplaced: UnplacedPiece[] = [];

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    quantities.set(item.partId, (quantities.get(item.partId) ?? 0) + Math.floor(item.quantity));
  }

  const grouped = new Map<number, Part[]>();
  for (const [partId, quantity] of quantities) {
    const part = partById.get(partId);
    if (!part) {
      warnings.add(`零件 #${partId} 已不存在，已跳过。`);
      continue;
    }
    const material = materialById.get(part.materialId);
    if (!material) {
      unplaced.push({
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        materialCode: '—',
        length: part.length,
        quantity,
        reason: '零件绑定的原料规格已不存在',
      });
      continue;
    }
    const list = grouped.get(material.id) ?? [];
    for (let i = 0; i < quantity; i += 1) list.push(part);
    grouped.set(material.id, list);
  }

  const bars: BarPlan[] = [];
  const summaries: MaterialPlanSummary[] = [];
  let barNo = 0;

  const materialIds = [...grouped.keys()].sort((a, b) => {
    const ma = materialById.get(a);
    const mb = materialById.get(b);
    return (ma?.code ?? '').localeCompare(mb?.code ?? '', 'zh-CN');
  });

  for (const materialId of materialIds) {
    const material = materialById.get(materialId);
    if (!material) continue;
    const instances = grouped.get(materialId) ?? [];
    const usableLength = material.length - clampMm;

    if (usableLength <= 0) {
      const counts = new Map<number, number>();
      for (const part of instances) counts.set(part.id, (counts.get(part.id) ?? 0) + 1);
      for (const [partId, quantity] of counts) {
        const part = partById.get(partId);
        if (!part) continue;
        unplaced.push({
          partId,
          partCode: part.code,
          partName: part.name,
          materialCode: material.code,
          length: part.length,
          quantity,
          reason: `原料长度不足，扣除夹持余量后无可用长度`,
        });
      }
      warnings.add(`${material.code} 的原料长度 ${material.length} mm 小于夹持余量 ${clampMm} mm。`);
      continue;
    }

    const fitting: Part[] = [];
    const tooLong = new Map<number, number>();
    for (const part of instances) {
      if (requiredOf(part, kerfMm) <= usableLength + EPS) {
        fitting.push(part);
      } else {
        tooLong.set(part.id, (tooLong.get(part.id) ?? 0) + 1);
      }
    }

    for (const [partId, quantity] of tooLong) {
      const part = partById.get(partId);
      if (!part) continue;
      unplaced.push({
        partId,
        partCode: part.code,
        partName: part.name,
        materialCode: material.code,
        length: part.length,
        quantity,
        reason: `超出可用长度 ${r3(usableLength)} mm（含切口 ${r3(kerfMm)} mm）`,
      });
    }

    if (tooLong.size > 0) {
      warnings.add(`${material.code} 有 ${[...tooLong.values()].reduce((a, b) => a + b, 0)} 件零件超长，未排入。`);
    }

    if (fitting.length === 0) continue;

    fitting.sort(
      (a, b) => b.length - a.length || a.code.localeCompare(b.code, 'zh-CN'),
    );

    const packed = reduceBins(packBestFit(fitting, usableLength, kerfMm), usableLength, kerfMm);
    const materialBars: BarPlan[] = [];
    for (const bin of packed) {
      barNo += 1;
      materialBars.push(buildBar(material, bin, barNo, cutMethod, kerfMm));
    }
    bars.push(...materialBars);

    const partsLength = materialBars.reduce((sum, bar) => sum + bar.partsLength, 0);
    const kerfTotal = materialBars.reduce((sum, bar) => sum + bar.kerfTotal, 0);
    const leftoverLength = materialBars.reduce((sum, bar) => sum + bar.leftoverLength, 0);
    const partWeightKg = materialBars.reduce((sum, bar) => sum + bar.weightKg, 0);
    const stockLengthTotal = materialBars.reduce((sum, bar) => sum + bar.stockLength, 0);
    const requiredBars = materialBars.length;
    const shortageBars = Math.max(0, requiredBars - material.quantity);

    summaries.push({
      materialId: material.id,
      materialCode: material.code,
      materialName: material.name,
      profile: material.profile,
      spec: formatMaterialSpec(material),
      grade: material.grade,
      stockLength: r3(material.length),
      inventoryQuantity: material.quantity,
      requiredBars,
      shortageBars,
      pieceCount: materialBars.reduce((sum, bar) => sum + bar.pieces.length, 0),
      partsLength: r3(partsLength),
      kerfTotal: r3(kerfTotal),
      leftoverLength: r3(leftoverLength),
      utilization: stockLengthTotal > 0 ? partsLength / stockLengthTotal : 0,
      partWeightKg,
      stockWeightKg: stockLengthTotal > 0 ? tubeWeightKg(material, material.length) * requiredBars : 0,
    });

    if (shortageBars > 0) {
      warnings.add(
        `${material.code} 库存不足：需要 ${requiredBars} 根，库存 ${material.quantity} 根，缺 ${shortageBars} 根。`,
      );
    }
  }

  if (bars.length === 0) {
    warnings.add('没有可排入的零件，请检查零件长度、原料规格和切割参数。');
  }

  const totals = {
    materialCount: summaries.length,
    stockCount: bars.length,
    pieceCount: bars.reduce((sum, bar) => sum + bar.pieces.length, 0),
    stockLengthTotal: r3(bars.reduce((sum, bar) => sum + bar.stockLength, 0)),
    partsLength: r3(bars.reduce((sum, bar) => sum + bar.partsLength, 0)),
    kerfTotal: r3(bars.reduce((sum, bar) => sum + bar.kerfTotal, 0)),
    leftoverLength: r3(bars.reduce((sum, bar) => sum + bar.leftoverLength, 0)),
    clampTotal: r3(bars.length * clampMm),
    utilization: 0,
    partWeightKg: bars.reduce((sum, bar) => sum + bar.weightKg, 0),
    stockWeightKg: 0,
    wasteWeightKg: 0,
  };

  totals.utilization =
    totals.stockLengthTotal > 0 ? totals.partsLength / totals.stockLengthTotal : 0;

  for (const summary of summaries) totals.stockWeightKg += summary.stockWeightKg;
  totals.stockWeightKg = Number(totals.stockWeightKg.toFixed(3));
  totals.partWeightKg = Number(totals.partWeightKg.toFixed(3));
  totals.wasteWeightKg = Number(Math.max(0, totals.stockWeightKg - totals.partWeightKg).toFixed(3));

  return {
    cutMethod,
    kerfMm,
    clampMm,
    bars,
    summaries,
    totals,
    warnings: [...warnings],
    unplaced,
    generatedAt: params.now ?? new Date().toISOString(),
  };
}
