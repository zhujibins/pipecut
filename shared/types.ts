export const CUT_METHODS = ['laser', 'saw'] as const;
export type CutMethod = (typeof CUT_METHODS)[number];

export const PROFILES = ['round', 'square', 'rect'] as const;
export type Profile = (typeof PROFILES)[number];

export interface MethodRule {
  label: string;
  shortLabel: string;
  kerfMin: number;
  kerfMax: number;
  kerfDefault: number;
  clampMm: number;
  note: string;
}

export const METHOD_RULES: Record<CutMethod, MethodRule> = {
  laser: {
    label: '激光切割',
    shortLabel: '激光',
    kerfMin: 1,
    kerfMax: 2,
    kerfDefault: 1.5,
    clampMm: 200,
    note: '每根原料预留 200 mm 设备夹持区，切口宽度可设 1–2 mm。',
  },
  saw: {
    label: '锯床切割',
    shortLabel: '锯床',
    kerfMin: 3,
    kerfMax: 5,
    kerfDefault: 4,
    clampMm: 0,
    note: '锯床不预留夹持余量，切口宽度可设 3–5 mm。',
  },
};

export interface Material {
  id: number;
  code: string;
  name: string;
  profile: Profile;
  outerDiameter: number;
  width: number;
  height: number;
  wallThickness: number;
  length: number;
  grade: string;
  density: number;
  quantity: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type MaterialInput = Omit<Material, 'id' | 'createdAt' | 'updatedAt'>;

export interface Part {
  id: number;
  code: string;
  name: string;
  materialId: number;
  length: number;
  quantity: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type PartInput = Omit<Part, 'id' | 'createdAt' | 'updatedAt'>;

export interface PlanItemInput {
  partId: number;
  quantity: number;
}

export interface PlanRequest {
  cutMethod: CutMethod;
  kerfMm: number;
  items: PlanItemInput[];
}

export interface BarPiece {
  sequence: number;
  partId: number;
  partCode: string;
  partName: string;
  length: number;
  weightKg: number;
}

export interface BarSegment {
  kind: 'part' | 'kerf' | 'leftover' | 'clamp';
  start: number;
  end: number;
  length: number;
  partId?: number;
  partCode?: string;
  partName?: string;
  sequence?: number;
}

export interface BarPlan {
  barNo: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  profile: Profile;
  spec: string;
  grade: string;
  stockLength: number;
  clampLength: number;
  usableLength: number;
  partsLength: number;
  kerfTotal: number;
  usedLength: number;
  leftoverLength: number;
  utilization: number;
  weightKg: number;
  pieces: BarPiece[];
  segments: BarSegment[];
}

export interface MaterialPlanSummary {
  materialId: number;
  materialCode: string;
  materialName: string;
  profile: Profile;
  spec: string;
  grade: string;
  stockLength: number;
  inventoryQuantity: number;
  requiredBars: number;
  shortageBars: number;
  pieceCount: number;
  partsLength: number;
  kerfTotal: number;
  leftoverLength: number;
  utilization: number;
  partWeightKg: number;
  stockWeightKg: number;
}

export interface PlanTotals {
  materialCount: number;
  stockCount: number;
  pieceCount: number;
  stockLengthTotal: number;
  partsLength: number;
  kerfTotal: number;
  leftoverLength: number;
  clampTotal: number;
  utilization: number;
  partWeightKg: number;
  stockWeightKg: number;
  wasteWeightKg: number;
}

export interface UnplacedPiece {
  partId: number;
  partCode: string;
  partName: string;
  materialCode: string;
  length: number;
  quantity: number;
  reason: string;
}

export interface PlanResult {
  cutMethod: CutMethod;
  kerfMm: number;
  clampMm: number;
  bars: BarPlan[];
  summaries: MaterialPlanSummary[];
  totals: PlanTotals;
  warnings: string[];
  unplaced: UnplacedPiece[];
  generatedAt: string;
}

export interface PlanSummary {
  id: number;
  name: string;
  cutMethod: CutMethod;
  kerfMm: number;
  clampMm: number;
  totalBars: number;
  utilization: number;
  partWeightKg: number;
  pieceCount: number;
  createdAt: string;
}

export interface PlanDetail extends PlanSummary {
  result: PlanResult;
  items: PlanItemInput[];
}

export interface ApiErrorBody {
  error: string;
  details?: { path?: string; message: string }[];
}

export interface MaterialFormValues {
  code: string;
  name: string;
  profile: Profile;
  outerDiameter: number;
  width: number;
  height: number;
  wallThickness: number;
  length: number;
  grade: string;
  density: number;
  quantity: number;
  note: string;
}

export interface PartFormValues {
  code: string;
  name: string;
  materialId: number;
  length: number;
  quantity: number;
  note: string;
}
