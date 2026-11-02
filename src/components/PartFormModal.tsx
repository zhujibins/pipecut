import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ruler, Save } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from './ui';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError, getErrorMessage } from '../lib/api';
import { partInputSchema } from '../../shared/validation';
import {
  formatMaterialSpec,
  formatNumber,
  formatWeight,
  profileLabel,
  tubeWeightKg,
} from '../../shared/format';
import type { Material, Part } from '../../shared/types';

interface PartFormModalProps {
  open: boolean;
  initial?: Part | null;
  defaultMaterialId?: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface FormState {
  code: string;
  name: string;
  materialId: string;
  length: string;
  quantity: string;
  note: string;
}

function nextCode(parts: Part[]): string {
  let max = 0;
  for (const part of parts) {
    const match = /^P-(\d+)$/i.exec(part.code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `P-${String(max + 1).padStart(3, '0')}`;
}

function emptyForm(materials: Material[], parts: Part[], defaultMaterialId?: number): FormState {
  return {
    code: nextCode(parts),
    name: '',
    materialId: String(defaultMaterialId ?? materials[0]?.id ?? ''),
    length: '',
    quantity: '1',
    note: '',
  };
}

function toForm(part: Part): FormState {
  return {
    code: part.code,
    name: part.name,
    materialId: String(part.materialId),
    length: String(part.length),
    quantity: String(part.quantity),
    note: part.note,
  };
}

function numberOf(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function PartFormModal({
  open,
  initial,
  defaultMaterialId,
  onClose,
  onSaved,
}: PartFormModalProps) {
  const { materials, parts, refreshAll } = useAppData();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(materials, parts, defaultMaterialId),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? toForm(initial) : emptyForm(materials, parts, defaultMaterialId));
    setErrors({});
  }, [open, initial, defaultMaterialId, materials, parts]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const selectedMaterial = materials.find((material) => material.id === Number(form.materialId));

  const weight = useMemo(() => {
    if (!selectedMaterial) return 0;
    const length = numberOf(form.length);
    return Number.isFinite(length) ? tubeWeightKg(selectedMaterial, length) : 0;
  }, [selectedMaterial, form.length]);

  const lengthNumber = numberOf(form.length);
  const laserLimit = selectedMaterial ? selectedMaterial.length - 200 : 0;
  const overLaser = selectedMaterial && Number.isFinite(lengthNumber) && lengthNumber > laserLimit;

  const submit = async () => {
    const input = {
      code: form.code.trim(),
      name: form.name.trim(),
      materialId: Number(form.materialId),
      length: numberOf(form.length),
      quantity: numberOf(form.quantity),
      note: form.note.trim(),
    };
    const parsed = partInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      if (initial) {
        await api.parts.update(initial.id, parsed.data);
        toast('零件已更新');
      } else {
        await api.parts.create(parsed.data);
        toast('零件已新增');
      }
      await refreshAll();
      await onSaved();
      onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.details?.length) {
        const next: Record<string, string> = {};
        for (const detail of cause.details) {
          if (detail.path) next[detail.path] = detail.message;
        }
        setErrors(next);
      }
      toast(getErrorMessage(cause), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? `编辑零件 · ${initial.code}` : '新增目标零件'}
      description="零件必须绑定一个原料规格；排料时按切割长度与数量计算。"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <Save size={16} />
            {initial ? '保存修改' : '创建零件'}
          </Button>
        </>
      }
    >
      <div className="form-grid two">
        <Field label="零件编号" required error={errors.code}>
          <Input
            value={form.code}
            onChange={(event) => set('code', event.target.value)}
            placeholder="如 P-001"
          />
        </Field>
        <Field label="零件名称" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="如 前横梁"
          />
        </Field>
        <Field label="所属原料规格" required error={errors.materialId} className="span-2">
          <Select
            value={form.materialId}
            onChange={(event) => set('materialId', event.target.value)}
            disabled={materials.length === 0}
          >
            {materials.length === 0 ? <option value="">请先新增原料规格</option> : null}
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.code} · {material.name} · {formatMaterialSpec(material)} · {material.grade}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="切割长度" required error={errors.length}>
          <div className="unit-input">
            <Input
              type="number"
              step="0.1"
              value={form.length}
              onChange={(event) => set('length', event.target.value)}
              placeholder="如 1850"
            />
            <span className="unit">mm</span>
          </div>
        </Field>
        <Field label="默认数量" required error={errors.quantity} hint="排料时会默认带出，可临时调整，不会写回零件库。">
          <div className="unit-input">
            <Input
              type="number"
              step="1"
              min="1"
              value={form.quantity}
              onChange={(event) => set('quantity', event.target.value)}
            />
            <span className="unit">件</span>
          </div>
        </Field>
        <Field label="备注" className="span-2">
          <Textarea
            rows={2}
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
            placeholder="如 坡口方向、成对加工、编号标记"
          />
        </Field>
      </div>

      {selectedMaterial ? (
        <div className="part-preview">
          <div className="part-preview-head">
            <div>
              <span className="preview-eyebrow">零件预览</span>
              <strong>{form.name || '未命名零件'}</strong>
            </div>
            <Badge tone="green">{profileLabel(selectedMaterial.profile)}</Badge>
          </div>
          <div className="part-preview-grid">
            <div>
              <span>原料规格</span>
              <strong>{formatMaterialSpec(selectedMaterial)}</strong>
            </div>
            <div>
              <span>材质</span>
              <strong>{selectedMaterial.grade}</strong>
            </div>
            <div>
              <span>单件估算重量</span>
              <strong>{formatWeight(weight)}</strong>
            </div>
            <div>
              <span>激光可用上限</span>
              <strong>{formatNumber(Math.max(0, laserLimit), 0)} mm</strong>
            </div>
          </div>
          {overLaser ? (
            <div className="inline-warning">
              <AlertTriangle size={15} />
              该长度超过激光切割可用长度（原料长度扣除 200 mm 夹持余量），激光排料时会标为超长。
            </div>
          ) : null}
          <div className="preview-note">
            <Ruler size={13} /> 切割长度不包含切口宽度；排料时会逐刀扣除。
          </div>
        </div>
      ) : (
        <div className="inline-warning">
          <AlertTriangle size={15} />
          还没有原料规格，请先在“原料规格”页面创建，再新增零件。
        </div>
      )}
    </Modal>
  );
}
