import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  Info,
  Lock,
  Play,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { PageHeader, Badge, Button, EmptyState, Field, Input, Modal, Segmented } from '../components/ui';
import { PlanResultView } from '../components/PlanResultView';
import { ExportDialog } from '../components/ExportDialog';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { api, getErrorMessage } from '../lib/api';
import { downloadPlanCsv } from '../lib/csv';
import {
  formatMaterialSpec,
  formatNumber,
  formatPercent,
  formatWeight,
  todayStamp,
  tubeWeightKg,
} from '../../shared/format';
import {
  METHOD_RULES,
  type CutMethod,
  type PlanItemInput,
  type PlanResult,
} from '../../shared/types';

function readMethod(): CutMethod {
  if (typeof window === 'undefined') return 'laser';
  return window.localStorage.getItem('pipecut.method') === 'saw' ? 'saw' : 'laser';
}

function readKerf(method: CutMethod): string {
  if (typeof window === 'undefined') return String(METHOD_RULES[method].kerfDefault);
  return (
    window.localStorage.getItem(`pipecut.kerf.${method}`) ?? String(METHOD_RULES[method].kerfDefault)
  );
}

function defaultPlanName(): string {
  return `${new Date().toLocaleDateString('zh-CN')} 排料方案`;
}

export function PlannerPage() {
  const { materials, parts, loading, error, refreshAll } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [cutMethod, setCutMethod] = useState<CutMethod>(readMethod);
  const [kerfInput, setKerfInput] = useState(() => readKerf(readMethod()));
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PlanResult | null>(null);
  const [stale, setStale] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(defaultPlanName);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const rule = METHOD_RULES[cutMethod];
  const kerfNumber = Number(kerfInput);
  const kerfValid = Number.isFinite(kerfNumber) && kerfNumber >= rule.kerfMin && kerfNumber <= rule.kerfMax;

  useEffect(() => {
    window.localStorage.setItem('pipecut.method', cutMethod);
  }, [cutMethod]);

  useEffect(() => {
    window.localStorage.setItem(`pipecut.kerf.${cutMethod}`, kerfInput);
  }, [cutMethod, kerfInput]);

  useEffect(() => {
    setSelected((current) => {
      const next: Record<number, boolean> = {};
      for (const part of parts) next[part.id] = current[part.id] ?? true;
      return next;
    });
    setQuantities((current) => {
      const next: Record<number, number> = {};
      for (const part of parts) next[part.id] = current[part.id] ?? part.quantity;
      return next;
    });
  }, [parts]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const markStale = () => {
    if (result) setStale(true);
  };

  const changeMethod = (next: CutMethod) => {
    setCutMethod(next);
    setKerfInput(readKerf(next));
    markStale();
  };

  const materialById = useMemo(() => new Map(materials.map((item) => [item.id, item])), [materials]);

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return materials
      .map((material) => ({
        material,
        parts: parts.filter((part) => {
          if (part.materialId !== material.id) return false;
          if (!keyword) return true;
          return `${part.code} ${part.name}`.toLowerCase().includes(keyword);
        }),
      }))
      .filter((group) => group.parts.length > 0);
  }, [materials, parts, query]);

  const selectedParts = useMemo(
    () => parts.filter((part) => selected[part.id] && (quantities[part.id] ?? 0) > 0),
    [parts, selected, quantities],
  );

  const totalPieces = selectedParts.reduce((sum, part) => sum + (quantities[part.id] ?? 0), 0);
  const totalNetLength = selectedParts.reduce(
    (sum, part) => sum + part.length * (quantities[part.id] ?? 0),
    0,
  );
  const totalWeight = selectedParts.reduce((sum, part) => {
    const material = materialById.get(part.materialId);
    return sum + (material ? tubeWeightKg(material, part.length) * (quantities[part.id] ?? 0) : 0);
  }, 0);

  const items: PlanItemInput[] = selectedParts.map((part) => ({
    partId: part.id,
    quantity: quantities[part.id] ?? 0,
  }));

  const togglePart = (id: number) => {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
    markStale();
  };

  const setQuantity = (id: number, value: number) => {
    setQuantities((current) => ({ ...current, [id]: value }));
    markStale();
  };

  const toggleGroup = (materialId: number, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      for (const part of parts) {
        if (part.materialId === materialId) next[part.id] = checked;
      }
      return next;
    });
    markStale();
  };

  const toggleAll = () => {
    const allSelected = parts.length > 0 && parts.every((part) => selected[part.id]);
    setSelected((current) => {
      const next = { ...current };
      for (const part of parts) next[part.id] = !allSelected;
      return next;
    });
    markStale();
  };

  const calculate = async () => {
    if (!kerfValid) {
      toast(`切口宽度应在 ${rule.kerfMin}–${rule.kerfMax} mm 之间`, 'error');
      return;
    }
    if (items.length === 0) {
      toast('请至少选择一个零件并填写数量', 'error');
      return;
    }
    if (totalPieces > 1500) {
      toast('单次排料最多 1500 件，请分批计算', 'error');
      return;
    }
    setCalculating(true);
    try {
      const next = await api.plans.calculate({
        cutMethod,
        kerfMm: kerfNumber,
        items,
      });
      setResult(next);
      setStale(false);
      setSaveName(defaultPlanName());
      if (next.warnings.length > 0) {
        toast(`排料完成，有 ${next.warnings.length} 条提示`, 'info');
      } else {
        toast('排料完成');
      }
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setCalculating(false);
    }
  };

  const loadDemo = async () => {
    setDemoLoading(true);
    try {
      await api.demo.load();
      await refreshAll();
      toast('示例数据已载入，可直接计算');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDemoLoading(false);
    }
  };

  const savePlan = async () => {
    const name = saveName.trim();
    if (!name) {
      setSaveError('请输入方案名称');
      return;
    }
    if (!result || stale) {
      setSaveError('参数已修改，请先重新计算');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const saved = await api.plans.save({
        name,
        cutMethod,
        kerfMm: kerfNumber,
        items,
      });
      toast('方案已保存');
      setSaveOpen(false);
      navigate(`/plans/${saved.id}`);
    } catch (cause) {
      setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const openSave = () => {
    setSaveName(defaultPlanName());
    setSaveError('');
    setSaveOpen(true);
  };

  const selectedCount = selectedParts.length;
  const allSelected = parts.length > 0 && parts.every((part) => selected[part.id]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="WORKBENCH / 01"
        title="排料工作台"
        description="选择切割方式与零件数量，系统会扣除切口和夹持余量，按库存计算每根原料的排样。"
        actions={
          <>
            <Link to="/materials" className="btn btn-secondary btn-md">
              管理原料
            </Link>
            <Link to="/parts" className="btn btn-dark btn-md">
              管理零件
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>数据加载失败</strong>
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refreshAll()}>
            <RefreshCw size={15} />
            重试
          </Button>
        </div>
      ) : null}

      <section className="panel param-panel">
        <div className="param-head">
          <div>
            <div className="panel-kicker">
              <Zap size={14} /> 切割参数
            </div>
            <h2>先确定下料方式</h2>
          </div>
          <span className="param-rule-note">参数会随方案一起保存</span>
        </div>

        <div className="param-grid">
          <div className="param-block method-block">
            <span className="param-label">切割方式</span>
            <Segmented<CutMethod>
              value={cutMethod}
              onChange={changeMethod}
              ariaLabel="切割方式"
              options={[
                {
                  value: 'laser',
                  label: (
                    <span className="method-option">
                      <Zap size={16} />
                      激光切割
                    </span>
                  ),
                  hint: '切口 1–2 mm · 夹持 200 mm',
                },
                {
                  value: 'saw',
                  label: (
                    <span className="method-option">
                      <ScissorsIcon />
                      锯床切割
                    </span>
                  ),
                  hint: '切口 3–5 mm · 无夹持余量',
                },
              ]}
            />
          </div>

          <div className="param-block kerf-block">
            <span className="param-label">切口宽度</span>
            <div className={`kerf-input-row${kerfValid ? '' : ' has-error'}`}>
              <Input
                type="number"
                step="0.1"
                min={rule.kerfMin}
                max={rule.kerfMax}
                value={kerfInput}
                onChange={(event) => {
                  setKerfInput(event.target.value);
                  markStale();
                }}
                aria-label="切口宽度"
              />
              <span className="unit-fixed">mm</span>
            </div>
            <div className="preset-row is-compact">
              {[rule.kerfMin, rule.kerfDefault, rule.kerfMax].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`preset-chip${Number(kerfInput) === value ? ' is-active' : ''}`}
                  onClick={() => {
                    setKerfInput(String(value));
                    markStale();
                  }}
                >
                  {value}
                </button>
              ))}
              <span className="kerf-hint">允许 {rule.kerfMin}–{rule.kerfMax} mm</span>
            </div>
          </div>

          <div className="param-block clamp-block">
            <span className="param-label">夹持余量</span>
            <div className="clamp-value">
              <Lock size={16} />
              <strong>{rule.clampMm === 0 ? '0' : rule.clampMm}</strong>
              <span>mm / 根</span>
            </div>
            <p className="clamp-note">
              {cutMethod === 'laser'
                ? '激光设备必须为夹持预留 200 mm，已自动锁定，避免误排。'
                : '锯床切割不占用夹持长度，原料可按全长排料。'}
            </p>
          </div>
        </div>

        <div className="param-note">
          <Info size={15} />
          {rule.note} 长度单位统一为 mm；每切一刀都会从可用长度中扣除切口。
        </div>
      </section>

      {loading ? (
        <div className="panel loading-panel">
          <div className="skeleton-line w40" />
          <div className="skeleton-line w80" />
          <div className="skeleton-line w60" />
        </div>
      ) : materials.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="还没有原料规格"
          description="先建立管材的截面、壁厚、长度和库存，再添加目标零件。也可以载入一组示例数据快速体验。"
          action={
            <div className="empty-actions">
              <Link to="/materials" className="btn btn-primary btn-md">
                新增原料规格
              </Link>
              <Button variant="secondary" onClick={loadDemo} loading={demoLoading}>
                <Sparkles size={16} />
                载入示例数据
              </Button>
            </div>
          }
        />
      ) : parts.length === 0 ? (
        <EmptyState
          icon={<FileText size={30} />}
          title="原料已就绪，还没有零件"
          description="在零件库中添加需要下料的长度、数量和所属原料规格，然后回到这里排料。"
          action={
            <Link to="/parts" className="btn btn-primary btn-md">
              新增目标零件
            </Link>
          }
        />
      ) : (
        <div className="planner-grid">
          <section className="panel task-panel">
            <div className="panel-head task-head">
              <div>
                <h3>选择目标零件</h3>
                <p>
                  已选 {selectedCount} 种 / {totalPieces} 件，默认数量来自零件库，可临时调整；只影响本次计算。
                </p>
              </div>
              <div className="task-head-actions">
                <div className="search-box">
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索零件编号或名称"
                    aria-label="搜索零件"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {allSelected ? '清空选择' : '全选'}
                </Button>
              </div>
            </div>

            <div className="task-groups">
              {groups.length === 0 ? (
                <div className="empty-inline">
                  <Search size={20} />
                  <p>没有匹配的零件，换个关键词试试。</p>
                </div>
              ) : (
                groups.map(({ material, parts: groupParts }) => {
                  const allGroupSelected = groupParts.every((part) => selected[part.id]);
                  const groupSelectedCount = groupParts.filter((part) => selected[part.id]).length;
                  const capacity = material.length - rule.clampMm;
                  return (
                    <div className="task-group" key={material.id}>
                      <header className="task-group-head">
                        <div className="material-badge">
                          <span className="material-shape">
                            {material.profile === 'round' ? 'Φ' : material.profile === 'square' ? '□' : '▭'}
                          </span>
                        </div>
                        <div className="task-group-title">
                          <div>
                            <strong>{material.code}</strong>
                            <span>{material.name}</span>
                          </div>
                          <small>
                            {formatMaterialSpec(material)} · {material.grade}
                          </small>
                        </div>
                        <div className="task-group-side">
                          <Badge tone={material.quantity > 0 ? 'green' : 'red'}>
                            库存 {material.quantity} 根
                          </Badge>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => toggleGroup(material.id, !allGroupSelected)}
                          >
                            {allGroupSelected ? '取消本组' : `全选本组 (${groupSelectedCount}/${groupParts.length})`}
                          </button>
                        </div>
                      </header>

                      <div className="part-table">
                        <div className="part-table-head">
                          <span />
                          <span>零件</span>
                          <span>切割长度</span>
                          <span>单件重量</span>
                          <span>数量</span>
                        </div>
                        {groupParts.map((part) => {
                          const isSelected = Boolean(selected[part.id]);
                          const quantity = quantities[part.id] ?? part.quantity;
                          const tooLong = part.length + (kerfValid ? kerfNumber : rule.kerfDefault) > capacity;
                          const weight = tubeWeightKg(material, part.length);
                          return (
                            <div
                              className={`part-row${isSelected ? ' is-selected' : ''}${tooLong ? ' has-warning' : ''}`}
                              key={part.id}
                            >
                              <input
                                type="checkbox"
                                className="checkbox"
                                checked={isSelected}
                                onChange={() => togglePart(part.id)}
                                aria-label={`选择 ${part.code}`}
                              />
                              <div className="part-main">
                                <div>
                                  <strong>{part.code}</strong>
                                  <span>{part.name}</span>
                                </div>
                                {tooLong || part.note ? (
                                  <small>
                                    {tooLong ? <Badge tone="red">超长</Badge> : null}
                                    {part.note}
                                  </small>
                                ) : null}
                              </div>
                              <div className="part-num part-length">
                                {formatNumber(part.length, 1)}
                                <span>mm</span>
                              </div>
                              <div className="part-num muted part-weight">
                                {formatNumber(weight, 2)}
                                <span>kg</span>
                              </div>
                              <div className="part-qty">
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={quantity}
                                  disabled={!isSelected}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setQuantity(part.id, Number.isFinite(next) ? next : 0);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label={`${part.code} 数量`}
                                />
                                <span>件</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside className="run-panel">
            <div className="run-card">
              <div className="run-card-head">
                <div className="panel-kicker">
                  <FileText size={14} /> 计算概要
                </div>
                <span className={`run-method method-${cutMethod}`}>
                  {rule.shortLabel} · {formatNumber(kerfNumber || 0, 1)} mm
                </span>
              </div>
              <div className="run-numbers">
                <div>
                  <span>零件种类</span>
                  <strong>{selectedCount}</strong>
                </div>
                <div>
                  <span>总件数</span>
                  <strong>{totalPieces}</strong>
                </div>
              </div>
              <div className="run-metrics">
                <div>
                  <span>净下料长度</span>
                  <strong>{formatNumber(totalNetLength, 0)} mm</strong>
                </div>
                <div>
                  <span>零件估算重量</span>
                  <strong>{formatWeight(totalWeight)}</strong>
                </div>
                <div>
                  <span>夹持余量</span>
                  <strong>{rule.clampMm} mm / 根</strong>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                block
                onClick={calculate}
                loading={calculating}
                disabled={!kerfValid || selectedParts.length === 0}
              >
                <Play size={17} />
                开始计算排料
              </Button>
              {!kerfValid ? (
                <p className="run-error">
                  切口宽度需在 {rule.kerfMin}–{rule.kerfMax} mm 之间
                </p>
              ) : (
                <p className="run-hint">计算会按当前库存给出需用根数，库存不足仍会完整排样并提示。</p>
              )}

              <div className="run-divider" />
              <div className="run-rules">
                <div>
                  <span>切口扣除</span>
                  <strong>每刀</strong>
                </div>
                <div>
                  <span>夹持端</span>
                  <strong>原料末端 {rule.clampMm} mm</strong>
                </div>
                <div>
                  <span>排料目标</span>
                  <strong>根数优先 · 余料集中</strong>
                </div>
              </div>
            </div>

            {result ? (
              <div className="run-mini-result">
                <div>
                  <span>最近一次计算</span>
                  <strong>{result.totals.stockCount} 根</strong>
                </div>
                <div>
                  <span>利用率</span>
                  <strong>{formatPercent(result.totals.utilization)}</strong>
                </div>
                <div>
                  <span>余料</span>
                  <strong>{formatNumber(result.totals.leftoverLength, 0)} mm</strong>
                </div>
              </div>
            ) : (
              <div className="run-tip">
                <ScissorsIcon />
                <p>建议先试切一件，确认切口宽度和夹持位置后再批量下料。</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {result ? (
        <div ref={resultRef} className="result-anchor">
          {stale ? (
            <div className="stale-banner">
              <AlertTriangle size={17} />
              <span>参数或数量已修改，当前结果不是最新的，请重新计算后再保存。</span>
              <Button variant="secondary" size="sm" onClick={calculate} loading={calculating}>
                <RefreshCw size={15} />
                重新计算
              </Button>
            </div>
          ) : null}
          <PlanResultView
            result={result}
            actions={
              <>
                <Button variant="ghost" onClick={() => downloadPlanCsv(saveName, result)}>
                  <FileSpreadsheet size={16} />
                  CSV
                </Button>
                <Button variant="secondary" onClick={() => setExportOpen(true)}>
                  <Printer size={16} />
                  打印 / 导出
                </Button>
                <Button variant="primary" onClick={openSave} disabled={stale}>
                  <Save size={16} />
                  保存方案
                </Button>
              </>
            }
          />
        </div>
      ) : null}

      <Modal
        open={saveOpen}
        title="保存排料方案"
        description="保存后原料和零件会保留快照，后续修改规格不会影响这张加工单。"
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" onClick={savePlan} loading={saving}>
              <Save size={16} />
              保存并查看
            </Button>
          </>
        }
      >
        <Field label="方案名称" required error={saveError}>
          <Input
            value={saveName}
            onChange={(event) => {
              setSaveName(event.target.value);
              setSaveError('');
            }}
            placeholder="如 2026-11-02 车间排料"
            autoFocus
          />
        </Field>
        {result ? (
          <div className="save-summary">
            <div>
              <span>切割方式</span>
              <strong>{rule.label}</strong>
            </div>
            <div>
              <span>原料 / 零件</span>
              <strong>
                {result.totals.stockCount} 根 / {result.totals.pieceCount} 件
              </strong>
            </div>
            <div>
              <span>利用率</span>
              <strong>{formatPercent(result.totals.utilization)}</strong>
            </div>
            <div>
              <span>方案日期</span>
              <strong>{todayStamp()}</strong>
            </div>
          </div>
        ) : null}
      </Modal>

      <ExportDialog
        open={exportOpen}
        name={saveName}
        result={result}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

function ScissorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 7l12 10M18 7L6 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="5" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
