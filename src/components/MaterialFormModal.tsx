import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Info, Layers, Save, Sparkles } from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Segmented,
  Textarea,
} from './ui';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError, getErrorMessage } from '../lib/api';
import { materialInputSchema } from '../../shared/validation';
import {
  formatMaterialSpec,
  formatWeight,
  profileLabel,
  tubeWeightKg,
} from '../../shared/format';
import { PROFILES, type Material, type Profile } from '../../shared/types';

interface MaterialFormModalProps {
  open: boolean;
  initial?: Material | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface FormState {
  code: string;
  name: string;
  profile: Profile;
  outerDiameter: string;
  width: string;
  height: string;
  wallThickness: string;
  length: string;
  grade: string;
  density: string;
  quantity: string;
  note: string;
}

const GRADE_PRESETS = [
  { grade: 'Q235', density: '7.85' },
  { grade: '20#', density: '7.85' },
  { grade: '304', density: '7.93' },
  { grade: '316L', density: '7.98' },
  { grade: '6061', density: '2.70' },
  { grade: 'H62', density: '8.50' },
];

function nextCode(materials: Material[]): string {
  let max = 0;
  for (const material of materials) {
    const match = /^M-(\d+)$/i.exec(material.code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `M-${String(max + 1).padStart(3, '0')}`;
}

function emptyForm(materials: Material[]): FormState {
  return {
    code: nextCode(materials),
    name: '',
    profile: 'round',
    outerDiameter: '60',
    width: '40',
    height: '40',
    wallThickness: '3',
    length: '6000',
    grade: 'Q235',
    density: '7.85',
    quantity: '10',
    note: '',
  };
}

function toForm(material: Material): FormState {
  return {
    code: material.code,
    name: material.name,
    profile: material.profile,
    outerDiameter: String(material.outerDiameter || ''),
    width: String(material.width || ''),
    height: String(material.height || ''),
    wallThickness: String(material.wallThickness),
    length: String(material.length),
    grade: material.grade,
    density: String(material.density),
    quantity: String(material.quantity),
    note: material.note,
  };
}

function numberOf(value: string): number {
  const trimmed = value.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

function SectionTitle({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="form-section-title">
      <span className="form-section-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
    </div>
  );
}

export function MaterialFormModal({ open, initial, onClose, onSaved }: MaterialFormModalProps) {
  const { materials, refreshAll } = useAppData();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(materials));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? toForm(initial) : emptyForm(materials));
    setErrors({});
  }, [open, initial, materials]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const previewMaterial = useMemo(() => {
    const material = {
      id: initial?.id ?? 0,
      code: form.code || 'M-000',
      name: form.name || '未命名规格',
      profile: form.profile,
      outerDiameter: numberOf(form.outerDiameter) || 0,
      width: numberOf(form.width) || 0,
      height: numberOf(form.height) || 0,
      wallThickness: numberOf(form.wallThickness) || 0,
      length: numberOf(form.length) || 0,
      grade: form.grade || '—',
      density: numberOf(form.density) || 0,
      quantity: numberOf(form.quantity) || 0,
      note: form.note,
      createdAt: '',
      updatedAt: '',
    } satisfies Material;
    return material;
  }, [form, initial?.id]);

  const previewWeight = useMemo(
    () => tubeWeightKg(previewMaterial, previewMaterial.length),
    [previewMaterial],
  );

  const buildInput = () => {
    const width = numberOf(form.width);
    const height = numberOf(form.height);
    return {
      code: form.code.trim(),
      name: form.name.trim(),
      profile: form.profile,
      outerDiameter: form.profile === 'round' ? numberOf(form.outerDiameter) : 0,
      width: form.profile === 'square' ? width : form.profile === 'rect' ? width : 0,
      height: form.profile === 'square' ? width : form.profile === 'rect' ? height : 0,
      wallThickness: numberOf(form.wallThickness),
      length: numberOf(form.length),
      grade: form.grade.trim(),
      density: numberOf(form.density),
      quantity: numberOf(form.quantity),
      note: form.note.trim(),
    };
  };

  const submit = async () => {
    const input = buildInput();
    const parsed = materialInputSchema.safeParse(input);
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
        await api.materials.update(initial.id, parsed.data);
        toast('原料规格已更新');
      } else {
        await api.materials.create(parsed.data);
        toast('原料规格已新增');
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

  const profileOptions = PROFILES.map((profile) => ({
    value: profile,
    label: profileLabel(profile),
    hint: profile === 'round' ? 'Φ' : profile === 'square' ? '□' : '▭',
  }));

  return (
    <Modal
      open={open}
      title={initial ? `编辑原料规格 · ${initial.code}` : '新增原料规格'}
      description="原料规格会作为零件排料的长度与重量基准；同一规格可设置多根库存。"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <Save size={16} />
            {initial ? '保存修改' : '创建规格'}
          </Button>
        </>
      }
    >
      <div className="form-with-preview">
        <div className="form-main">
          <SectionTitle
            icon={<Info size={17} />}
            title="基础信息"
            hint="编号用于排料单和 CSV，建议保持唯一且简洁。"
          />
          <div className="form-grid two">
            <Field label="规格编号" required error={errors.code}>
              <Input
                value={form.code}
                onChange={(event) => set('code', event.target.value)}
                placeholder="如 M-001"
              />
            </Field>
            <Field label="规格名称" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="如 碳钢无缝管"
              />
            </Field>
            <Field label="材质牌号" required error={errors.grade}>
              <Input
                value={form.grade}
                onChange={(event) => set('grade', event.target.value)}
                placeholder="如 Q235、304"
              />
            </Field>
            <Field label="材料密度" required error={errors.density} hint="单位 g/cm³，用于估算重量。">
              <div className="unit-input">
                <Input
                  type="number"
                  step="0.01"
                  value={form.density}
                  onChange={(event) => set('density', event.target.value)}
                />
                <span className="unit">g/cm³</span>
              </div>
            </Field>
          </div>

          <div className="preset-row">
            <span className="preset-label">常用材质</span>
            {GRADE_PRESETS.map((preset) => (
              <button
                key={preset.grade}
                type="button"
                className={`preset-chip${form.grade === preset.grade ? ' is-active' : ''}`}
                onClick={() => {
                  set('grade', preset.grade);
                  set('density', preset.density);
                }}
              >
                {preset.grade}
                <small>{preset.density}</small>
              </button>
            ))}
          </div>

          <SectionTitle
            icon={<Layers size={17} />}
            title="截面与长度"
            hint="支持圆管、方管、矩形管；排料按一维长度计算。"
          />
          <div className="profile-segment">
            <Segmented
              value={form.profile}
              onChange={(value) => set('profile', value)}
              options={profileOptions}
              ariaLabel="选择截面形状"
            />
          </div>

          <div className="form-grid three">
            {form.profile === 'round' ? (
              <Field label="外径" required error={errors.outerDiameter}>
                <div className="unit-input">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.outerDiameter}
                    onChange={(event) => set('outerDiameter', event.target.value)}
                  />
                  <span className="unit">mm</span>
                </div>
              </Field>
            ) : null}

            {form.profile === 'square' ? (
              <Field label="边长" required error={errors.width}>
                <div className="unit-input">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.width}
                    onChange={(event) => set('width', event.target.value)}
                  />
                  <span className="unit">mm</span>
                </div>
              </Field>
            ) : null}

            {form.profile === 'rect' ? (
              <>
                <Field label="宽度" required error={errors.width}>
                  <div className="unit-input">
                    <Input
                      type="number"
                      step="0.1"
                      value={form.width}
                      onChange={(event) => set('width', event.target.value)}
                    />
                    <span className="unit">mm</span>
                  </div>
                </Field>
                <Field label="高度" required error={errors.height}>
                  <div className="unit-input">
                    <Input
                      type="number"
                      step="0.1"
                      value={form.height}
                      onChange={(event) => set('height', event.target.value)}
                    />
                    <span className="unit">mm</span>
                  </div>
                </Field>
              </>
            ) : null}

            <Field label="壁厚" required error={errors.wallThickness}>
              <div className="unit-input">
                <Input
                  type="number"
                  step="0.1"
                  value={form.wallThickness}
                  onChange={(event) => set('wallThickness', event.target.value)}
                />
                <span className="unit">mm</span>
              </div>
            </Field>

            <Field label="原料长度" required error={errors.length}>
              <div className="unit-input">
                <Input
                  type="number"
                  step="1"
                  value={form.length}
                  onChange={(event) => set('length', event.target.value)}
                />
                <span className="unit">mm</span>
              </div>
            </Field>
          </div>

          <SectionTitle
            icon={<Sparkles size={17} />}
            title="库存与备注"
            hint="排料时优先使用库存；不足会在结果中明确提示。"
          />
          <div className="form-grid two">
            <Field label="库存根数" required error={errors.quantity}>
              <div className="unit-input">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.quantity}
                  onChange={(event) => set('quantity', event.target.value)}
                />
                <span className="unit">根</span>
              </div>
            </Field>
            <Field label="备注">
              <Textarea
                rows={2}
                value={form.note}
                onChange={(event) => set('note', event.target.value)}
                placeholder="如供应商、存放区域、切割注意事项"
              />
            </Field>
          </div>
        </div>

        <aside className="form-preview">
          <div className="preview-eyebrow">规格预览</div>
          <div className="preview-code">{previewMaterial.code}</div>
          <h3>{previewMaterial.name || '未命名规格'}</h3>
          <div className="preview-spec">{formatMaterialSpec(previewMaterial)}</div>
          <div className="preview-tags">
            <Badge tone="green">{profileLabel(previewMaterial.profile)}</Badge>
            <Badge tone="orange">{previewMaterial.grade || '未设置材质'}</Badge>
          </div>
          <dl className="preview-list">
            <div>
              <dt>单根长度</dt>
              <dd>{numberOf(form.length) ? `${numberOf(form.length).toLocaleString('zh-CN')} mm` : '—'}</dd>
            </div>
            <div>
              <dt>估算单根重量</dt>
              <dd>{formatWeight(previewWeight)}</dd>
            </div>
            <div>
              <dt>库存</dt>
              <dd>{numberOf(form.quantity) || 0} 根</dd>
            </div>
            <div>
              <dt>库存总长</dt>
              <dd>
                {numberOf(form.length) && numberOf(form.quantity)
                  ? `${((numberOf(form.length) * numberOf(form.quantity)) / 1000).toLocaleString('zh-CN', {
                      maximumFractionDigits: 1,
                    })} m`
                  : '—'}
              </dd>
            </div>
          </dl>
          <div className="preview-note">
            重量按截面面积 × 长度 × 密度估算，仅用于备料参考，实际以过磅为准。
          </div>
        </aside>
      </div>
    </Modal>
  );
}
