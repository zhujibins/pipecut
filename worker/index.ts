import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodError } from 'zod';
import { calculatePlan } from '../shared/optimizer';
import {
  calculatePlanSchema,
  firstZodMessage,
  materialInputSchema,
  partInputSchema,
  savePlanSchema,
} from '../shared/validation';
import type {
  CutMethod,
  Material,
  Part,
  PlanDetail,
  PlanItemInput,
  PlanResult,
  PlanSummary,
  Profile,
} from '../shared/types';

interface Env {
  DB: D1Database;
}

type AppEnv = { Bindings: Env };

interface MaterialRow {
  id: number;
  code: string;
  name: string;
  profile: string;
  outer_diameter: number;
  width: number;
  height: number;
  wall_thickness: number;
  length: number;
  grade: string;
  density: number;
  quantity: number;
  note: string;
  created_at: string;
  updated_at: string;
}

interface PartRow {
  id: number;
  code: string;
  name: string;
  material_id: number;
  length: number;
  quantity: number;
  note: string;
  created_at: string;
  updated_at: string;
}

interface PlanSummaryRow {
  id: number;
  name: string;
  cut_method: string;
  kerf_mm: number;
  clamp_mm: number;
  total_bars: number;
  utilization: number;
  part_weight_kg: number;
  piece_count: number;
  created_at: string;
}

interface PlanRow extends PlanSummaryRow {
  payload: string;
}

interface StoredPayload {
  version: number;
  items: PlanItemInput[];
  result: PlanResult;
}

interface CalculationInput {
  cutMethod: CutMethod;
  kerfMm: number;
  items: PlanItemInput[];
}

type CalculationOutcome =
  | { ok: true; result: PlanResult }
  | { ok: false; status: 400 | 404 | 409; message: string };

const app = new Hono<AppEnv>();

function nowIso(): string {
  return new Date().toISOString();
}

function mapMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    profile: row.profile as Profile,
    outerDiameter: row.outer_diameter,
    width: row.width,
    height: row.height,
    wallThickness: row.wall_thickness,
    length: row.length,
    grade: row.grade,
    density: row.density,
    quantity: row.quantity,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPart(row: PartRow): Part {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    materialId: row.material_id,
    length: row.length,
    quantity: row.quantity,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlanSummary(row: PlanSummaryRow): PlanSummary {
  return {
    id: row.id,
    name: row.name,
    cutMethod: row.cut_method as CutMethod,
    kerfMm: row.kerf_mm,
    clampMm: row.clamp_mm,
    totalBars: row.total_bars,
    utilization: row.utilization,
    partWeightKg: row.part_weight_kg,
    pieceCount: row.piece_count,
    createdAt: row.created_at,
  };
}

function zodErrorResponse(c: Context<AppEnv>, error: ZodError, status: 400 | 422 = 400) {
  return c.json(
    {
      error: firstZodMessage(error),
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    status,
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function calculateFromDb(db: D1Database, input: CalculationInput): Promise<CalculationOutcome> {
  const uniqueIds = [...new Set(input.items.map((item) => item.partId))];
  if (uniqueIds.length === 0) {
    return { ok: false, status: 400, message: '请至少选择一个零件' };
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const partRows = await db
    .prepare(`SELECT * FROM parts WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .all<PartRow>();
  if (partRows.results.length !== uniqueIds.length) {
    return { ok: false, status: 409, message: '部分零件已被删除，请刷新页面后重试' };
  }

  const materialRows = await db.prepare('SELECT * FROM materials').all<MaterialRow>();
  const result = calculatePlan({
    materials: materialRows.results.map(mapMaterial),
    parts: partRows.results.map(mapPart),
    items: input.items,
    cutMethod: input.cutMethod,
    kerfMm: input.kerfMm,
  });
  return { ok: true, result };
}

app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

app.get('/api/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ ok: true, service: 'pipecut', time: nowIso() });
});

app.get('/api/materials', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM materials ORDER BY code COLLATE NOCASE ASC, id ASC',
  ).all<MaterialRow>();
  return c.json(rows.results.map(mapMaterial));
});

app.post('/api/materials', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = materialInputSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const timestamp = nowIso();
  const value = parsed.data;
  try {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO materials
        (code, name, profile, outer_diameter, width, height, wall_thickness, length, grade, density, quantity, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        value.code,
        value.name,
        value.profile,
        value.outerDiameter,
        value.width,
        value.height,
        value.wallThickness,
        value.length,
        value.grade,
        value.density,
        value.quantity,
        value.note,
        timestamp,
        timestamp,
      )
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?')
      .bind(Number(inserted.meta.last_row_id))
      .first<MaterialRow>();
    return c.json(row ? mapMaterial(row) : null, 201);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return c.json({ error: `规格编号 ${value.code} 已存在` }, 409);
    }
    throw error;
  }
});

app.put('/api/materials/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的规格编号' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = materialInputSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const existing = await c.env.DB.prepare('SELECT id FROM materials WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: '原料规格不存在' }, 404);

  const value = parsed.data;
  try {
    await c.env.DB.prepare(
      `UPDATE materials SET
        code = ?, name = ?, profile = ?, outer_diameter = ?, width = ?, height = ?,
        wall_thickness = ?, length = ?, grade = ?, density = ?, quantity = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        value.code,
        value.name,
        value.profile,
        value.outerDiameter,
        value.width,
        value.height,
        value.wallThickness,
        value.length,
        value.grade,
        value.density,
        value.quantity,
        value.note,
        nowIso(),
        id,
      )
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?')
      .bind(id)
      .first<MaterialRow>();
    return c.json(row ? mapMaterial(row) : null);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return c.json({ error: `规格编号 ${value.code} 已存在` }, 409);
    }
    throw error;
  }
});

app.delete('/api/materials/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的规格编号' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM materials WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: '原料规格不存在' }, 404);

  const usage = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM parts WHERE material_id = ?')
    .bind(id)
    .first<{ count: number }>();
  const count = usage?.count ?? 0;
  if (count > 0) {
    return c.json(
      { error: `该规格下还有 ${count} 个零件，请先删除或改绑这些零件` },
      409,
    );
  }

  await c.env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/parts', async (c) => {
  const materialId = c.req.query('materialId');
  if (materialId) {
    const id = parseId(materialId);
    if (!id) return c.json({ error: '无效的原料编号' }, 400);
    const rows = await c.env.DB.prepare(
      'SELECT * FROM parts WHERE material_id = ? ORDER BY code COLLATE NOCASE ASC, id ASC',
    )
      .bind(id)
      .all<PartRow>();
    return c.json(rows.results.map(mapPart));
  }

  const rows = await c.env.DB.prepare(
    'SELECT * FROM parts ORDER BY material_id ASC, code COLLATE NOCASE ASC, id ASC',
  ).all<PartRow>();
  return c.json(rows.results.map(mapPart));
});

app.post('/api/parts', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = partInputSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const value = parsed.data;
  const material = await c.env.DB.prepare('SELECT id FROM materials WHERE id = ?')
    .bind(value.materialId)
    .first<{ id: number }>();
  if (!material) return c.json({ error: '所选原料规格不存在' }, 400);

  const timestamp = nowIso();
  try {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO parts (code, name, material_id, length, quantity, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        value.code,
        value.name,
        value.materialId,
        value.length,
        value.quantity,
        value.note,
        timestamp,
        timestamp,
      )
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM parts WHERE id = ?')
      .bind(Number(inserted.meta.last_row_id))
      .first<PartRow>();
    return c.json(row ? mapPart(row) : null, 201);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return c.json({ error: `零件编号 ${value.code} 已存在` }, 409);
    }
    throw error;
  }
});

app.put('/api/parts/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的零件编号' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = partInputSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const existing = await c.env.DB.prepare('SELECT id FROM parts WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: '零件不存在' }, 404);

  const value = parsed.data;
  const material = await c.env.DB.prepare('SELECT id FROM materials WHERE id = ?')
    .bind(value.materialId)
    .first<{ id: number }>();
  if (!material) return c.json({ error: '所选原料规格不存在' }, 400);

  try {
    await c.env.DB.prepare(
      `UPDATE parts SET code = ?, name = ?, material_id = ?, length = ?, quantity = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        value.code,
        value.name,
        value.materialId,
        value.length,
        value.quantity,
        value.note,
        nowIso(),
        id,
      )
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM parts WHERE id = ?')
      .bind(id)
      .first<PartRow>();
    return c.json(row ? mapPart(row) : null);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return c.json({ error: `零件编号 ${value.code} 已存在` }, 409);
    }
    throw error;
  }
});

app.delete('/api/parts/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的零件编号' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM parts WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: '零件不存在' }, 404);

  await c.env.DB.prepare('DELETE FROM parts WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/plans/calculate', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = calculatePlanSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const outcome = await calculateFromDb(c.env.DB, parsed.data);
  if (!outcome.ok) return c.json({ error: outcome.message }, outcome.status);
  return c.json(outcome.result);
});

app.get('/api/plans', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, cut_method, kerf_mm, clamp_mm, total_bars, utilization, part_weight_kg, piece_count, created_at
     FROM plans ORDER BY id DESC LIMIT 200`,
  ).all<PlanSummaryRow>();
  return c.json(rows.results.map(mapPlanSummary));
});

app.post('/api/plans', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = savePlanSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const outcome = await calculateFromDb(c.env.DB, parsed.data);
  if (!outcome.ok) return c.json({ error: outcome.message }, outcome.status);

  const result = outcome.result;
  const stored: StoredPayload = {
    version: 1,
    items: parsed.data.items,
    result,
  };
  const serialized = JSON.stringify(stored);
  if (serialized.length > 800_000) {
    return c.json(
      {
        error: '方案数据过大，无法保存。请减少零件数量后分批排料，或先打印当前结果。',
      },
      413,
    );
  }
  const createdAt = nowIso();
  const inserted = await c.env.DB.prepare(
    `INSERT INTO plans
      (name, cut_method, kerf_mm, clamp_mm, total_bars, utilization, part_weight_kg, piece_count, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      parsed.data.name,
      result.cutMethod,
      result.kerfMm,
      result.clampMm,
      result.totals.stockCount,
      result.totals.utilization,
      result.totals.partWeightKg,
      result.totals.pieceCount,
      serialized,
      createdAt,
    )
    .run();

  return c.json({ id: Number(inserted.meta.last_row_id) }, 201);
});

app.get('/api/plans/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的方案编号' }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?')
    .bind(id)
    .first<PlanRow>();
  if (!row) return c.json({ error: '方案不存在' }, 404);

  let payload: StoredPayload;
  try {
    payload = JSON.parse(row.payload) as StoredPayload;
  } catch {
    return c.json({ error: '方案数据损坏，无法读取' }, 500);
  }

  const detail: PlanDetail = {
    ...mapPlanSummary(row),
    result: payload.result,
    items: payload.items,
  };
  return c.json(detail);
});

app.delete('/api/plans/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的方案编号' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM plans WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: '方案不存在' }, 404);

  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/demo', async (c) => {
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM materials').first<{
    count: number;
  }>();
  if ((countRow?.count ?? 0) > 0) {
    return c.json({ error: '已经有原料数据，未载入示例。请清空数据后再试。' }, 409);
  }

  const timestamp = nowIso();
  const materialSeeds = [
    {
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
      quantity: 12,
      note: '激光切割常用规格',
    },
    {
      code: 'M-002',
      name: '304 不锈钢管',
      profile: 'round',
      outerDiameter: 42,
      width: 0,
      height: 0,
      wallThickness: 2,
      length: 6000,
      grade: '304',
      density: 7.93,
      quantity: 8,
      note: '',
    },
    {
      code: 'M-003',
      name: '方管 40×40',
      profile: 'square',
      outerDiameter: 0,
      width: 40,
      height: 40,
      wallThickness: 2,
      length: 6000,
      grade: 'Q235',
      density: 7.85,
      quantity: 6,
      note: '设备支架用',
    },
  ] as const;

  const materialIds: number[] = [];
  for (const seed of materialSeeds) {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO materials
        (code, name, profile, outer_diameter, width, height, wall_thickness, length, grade, density, quantity, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        seed.code,
        seed.name,
        seed.profile,
        seed.outerDiameter,
        seed.width,
        seed.height,
        seed.wallThickness,
        seed.length,
        seed.grade,
        seed.density,
        seed.quantity,
        seed.note,
        timestamp,
        timestamp,
      )
      .run();
    materialIds.push(Number(inserted.meta.last_row_id));
  }

  const partSeeds = [
    { code: 'P-001', name: '前横梁', materialIndex: 0, length: 1850, quantity: 4 },
    { code: 'P-002', name: '斜撑', materialIndex: 0, length: 1220, quantity: 6 },
    { code: 'P-003', name: '短撑', materialIndex: 0, length: 2750, quantity: 2 },
    { code: 'P-004', name: '连接套管', materialIndex: 1, length: 860, quantity: 8 },
    { code: 'P-005', name: '电机支架', materialIndex: 2, length: 430, quantity: 10 },
  ];

  for (const seed of partSeeds) {
    await c.env.DB.prepare(
      `INSERT INTO parts (code, name, material_id, length, quantity, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
    )
      .bind(
        seed.code,
        seed.name,
        materialIds[seed.materialIndex],
        seed.length,
        seed.quantity,
        timestamp,
        timestamp,
      )
      .run();
  }

  return c.json({ ok: true, materials: materialSeeds.length, parts: partSeeds.length });
});

app.notFound((c) => c.json({ error: '接口不存在' }, 404));

app.onError((error, c) => {
  console.error('Unhandled API error', error);
  return c.json({ error: '服务器内部错误，请稍后重试' }, 500);
});

export default app;
