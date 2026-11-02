import {
  formatMaterialSpec,
  formatNumber,
  profileLabel,
  todayStamp,
  tubeWeightKg,
} from '../../shared/format';
import { METHOD_RULES, type Material, type Part, type PlanResult } from '../../shared/types';
import { formatBarRange, groupBars } from '../../shared/group';
import { downloadText, makeFilename } from './download';

function num(value: number, digits = 2): string {
  return formatNumber(value, digits).replace(/,/g, '');
}

function escapeCsv(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function materialsCsv(materials: Material[]): string {
  return toCsv(
    [
      '规格编号',
      '名称',
      '截面',
      '外径(mm)',
      '边长(mm)',
      '宽(mm)',
      '高(mm)',
      '壁厚(mm)',
      '原料长度(mm)',
      '材质牌号',
      '密度(g/cm³)',
      '库存(根)',
      '单根重量(kg)',
      '备注',
    ],
    materials.map((material) => [
      material.code,
      material.name,
      profileLabel(material.profile),
      material.profile === 'round' ? num(material.outerDiameter) : '',
      material.profile === 'square' ? num(material.width) : material.profile === 'rect' ? num(material.width) : '',
      material.profile === 'rect' ? num(material.height) : '',
      num(material.wallThickness),
      num(material.length),
      material.grade,
      num(material.density),
      material.quantity,
      num(tubeWeightKg(material, material.length), 3),
      material.note,
    ]),
  );
}

export function partsCsv(parts: Part[], materials: Material[]): string {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  return toCsv(
    [
      '零件编号',
      '名称',
      '原料规格编号',
      '原料名称',
      '截面规格',
      '材质牌号',
      '切割长度(mm)',
      '默认数量',
      '单件重量(kg)',
      '单件毛重合计(kg)',
      '备注',
    ],
    parts.map((part) => {
      const material = materialById.get(part.materialId);
      const weight = material ? tubeWeightKg(material, part.length) : 0;
      return [
        part.code,
        part.name,
        material?.code ?? '',
        material?.name ?? '',
        material ? formatMaterialSpec(material) : '规格已删除',
        material?.grade ?? '',
        num(part.length),
        part.quantity,
        num(weight, 3),
        num(weight * part.quantity, 3),
        part.note,
      ];
    }),
  );
}

export function planCsv(name: string, result: PlanResult): string {
  const rows: (string | number)[][] = [];
  for (const group of groupBars(result.bars)) {
    const bar = group.sample;
    for (const piece of bar.pieces) {
      rows.push([
        name,
        METHOD_RULES[result.cutMethod].label,
        num(result.kerfMm),
        num(result.clampMm),
        formatBarRange(group.barNos),
        group.count,
        bar.materialCode,
        bar.materialName,
        bar.spec,
        bar.grade,
        piece.sequence,
        piece.partCode,
        piece.partName,
        num(piece.length),
        num(piece.weightKg, 3),
        num(bar.stockLength),
        num(bar.leftoverLength),
        num(group.totalLeftoverLength),
        num(bar.utilization * 100, 1),
        num(bar.weightKg, 3),
        num(group.totalWeightKg, 3),
      ]);
    }
  }

  return toCsv(
    [
      '方案名称',
      '切割方式',
      '切口宽度(mm)',
      '夹持余量(mm)',
      '原料根号',
      '重复根数',
      '原料编号',
      '原料名称',
      '原料规格',
      '材质牌号',
      '零件序号',
      '零件编号',
      '零件名称',
      '切割长度(mm)',
      '单件重量(kg)',
      '原料长度(mm)',
      '单根余料(mm)',
      '合计余料(mm)',
      '该排样利用率(%)',
      '单根零件重(kg)',
      '合计零件重(kg)',
    ],
    rows,
  );
}

export function downloadMaterialsCsv(materials: Material[]): void {
  downloadText(makeFilename(`原料规格-${todayStamp()}`, 'csv'), materialsCsv(materials));
}

export function downloadPartsCsv(parts: Part[], materials: Material[]): void {
  downloadText(makeFilename(`零件清单-${todayStamp()}`, 'csv'), partsCsv(parts, materials));
}

export function downloadPlanCsv(name: string, result: PlanResult): void {
  downloadText(makeFilename(`${name}-下料明细-${todayStamp()}`, 'csv'), planCsv(name, result));
}
