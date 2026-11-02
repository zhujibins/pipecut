import { z } from 'zod';
import { CUT_METHODS, METHOD_RULES, PROFILES } from './types';

const codeSchema = z
  .string()
  .trim()
  .min(1, '请输入编号')
  .max(40, '编号不能超过 40 个字符');

const nameSchema = z
  .string()
  .trim()
  .min(1, '请输入名称')
  .max(100, '名称不能超过 100 个字符');

export const materialInputSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    profile: z.enum(PROFILES),
    outerDiameter: z.number().nonnegative('外径不能为负数').max(5000, '外径超出范围'),
    width: z.number().nonnegative('边长不能为负数').max(5000, '尺寸超出范围'),
    height: z.number().nonnegative('高度不能为负数').max(5000, '尺寸超出范围'),
    wallThickness: z.number().positive('壁厚必须大于 0').max(500, '壁厚超出范围'),
    length: z.number().positive('原料长度必须大于 0').max(100000, '原料长度超出范围'),
    grade: z.string().trim().min(1, '请输入材质牌号').max(60, '材质牌号不能超过 60 个字符'),
    density: z.number().positive('密度必须大于 0').max(25, '密度超出范围'),
    quantity: z.number().int('库存必须是整数').min(0, '库存不能为负数').max(1000000, '库存超出范围'),
    note: z.string().trim().max(500, '备注不能超过 500 个字符').default(''),
  })
  .superRefine((value, ctx) => {
    const t = value.wallThickness;
    if (value.profile === 'round') {
      if (value.outerDiameter <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['outerDiameter'],
          message: '圆管外径必须大于 0',
        });
      } else if (value.outerDiameter <= t * 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['outerDiameter'],
          message: '外径必须大于 2 倍壁厚',
        });
      }
    }
    if (value.profile === 'square') {
      if (value.width <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['width'],
          message: '方管边长必须大于 0',
        });
      } else if (value.width <= t * 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['width'],
          message: '边长必须大于 2 倍壁厚',
        });
      }
    }
    if (value.profile === 'rect') {
      if (value.width <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['width'],
          message: '矩形管宽度必须大于 0',
        });
      }
      if (value.height <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['height'],
          message: '矩形管高度必须大于 0',
        });
      }
      if (value.width > 0 && value.height > 0) {
        if (Math.min(value.width, value.height) <= t * 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['height'],
            message: '宽和高都必须大于 2 倍壁厚',
          });
        }
      }
    }
  });

export const partInputSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  materialId: z.number().int('请选择原料规格').positive('请选择原料规格'),
  length: z.number().positive('切割长度必须大于 0').max(100000, '切割长度超出范围'),
  quantity: z.number().int('数量必须是整数').positive('数量至少为 1').max(100000, '数量超出范围'),
  note: z.string().trim().max(500, '备注不能超过 500 个字符').default(''),
});

const planItemSchema = z.object({
  partId: z.number().int().positive(),
  quantity: z.number().int('数量必须是整数').positive('数量至少为 1').max(100000, '数量超出范围'),
});

const planBaseSchema = z.object({
  cutMethod: z.enum(CUT_METHODS),
  kerfMm: z.number().positive('切口宽度必须大于 0').max(50, '切口宽度超出范围'),
  items: z.array(planItemSchema).min(1, '请至少选择一个零件').max(200, '一次最多选择 200 种零件'),
});

export const calculatePlanSchema = planBaseSchema.superRefine((value, ctx) => {
  const rule = METHOD_RULES[value.cutMethod];
  if (value.kerfMm < rule.kerfMin || value.kerfMm > rule.kerfMax) {
    ctx.addIssue({
      code: 'custom',
      path: ['kerfMm'],
      message: `${rule.label}的切口宽度应在 ${rule.kerfMin}–${rule.kerfMax} mm 之间`,
    });
  }
  const totalPieces = value.items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalPieces > 1500) {
    ctx.addIssue({
      code: 'custom',
      path: ['items'],
      message: '单次排料最多 1500 件，请分批计算',
    });
  }
});

export const savePlanSchema = planBaseSchema
  .extend({
    name: z.string().trim().min(1, '请输入方案名称').max(80, '方案名称不能超过 80 个字符'),
  })
  .superRefine((value, ctx) => {
    const rule = METHOD_RULES[value.cutMethod];
    if (value.kerfMm < rule.kerfMin || value.kerfMm > rule.kerfMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['kerfMm'],
        message: `${rule.label}的切口宽度应在 ${rule.kerfMin}–${rule.kerfMax} mm 之间`,
      });
    }
    const totalPieces = value.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalPieces > 1500) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: '单次排料最多 1500 件，请分批计算',
      });
    }
  });

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? '输入数据有误';
}
