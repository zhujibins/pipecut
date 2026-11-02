import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  Select,
  StatCard,
} from '../components/ui';
import { PartFormModal } from '../components/PartFormModal';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { api, getErrorMessage } from '../lib/api';
import { downloadPartsCsv } from '../lib/csv';
import {
  formatMaterialSpec,
  formatNumber,
  formatWeight,
  tubeWeightKg,
} from '../../shared/format';
import type { Part } from '../../shared/types';

export function PartsPage() {
  const { materials, parts, loading, error, refreshAll } = useAppData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const materialById = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return parts.filter((part) => {
      if (materialFilter !== 'all' && part.materialId !== Number(materialFilter)) return false;
      if (!keyword) return true;
      return `${part.code} ${part.name}`.toLowerCase().includes(keyword);
    });
  }, [parts, query, materialFilter]);

  const totalPieces = parts.reduce((sum, part) => sum + part.quantity, 0);
  const totalNetLength = parts.reduce((sum, part) => sum + part.length * part.quantity, 0);
  const totalWeight = parts.reduce((sum, part) => {
    const material = materialById.get(part.materialId);
    return sum + (material ? tubeWeightKg(material, part.length) * part.quantity : 0);
  }, 0);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (part: Part) => {
    setEditing(part);
    setFormOpen(true);
  };

  const remove = async (part: Part) => {
    if (!window.confirm(`确定删除零件 ${part.code}（${part.name}）吗？已保存的方案快照不受影响。`)) {
      return;
    }
    setDeletingId(part.id);
    try {
      await api.parts.remove(part.id);
      await refreshAll();
      toast('零件已删除');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const defaultMaterialId =
    materialFilter !== 'all' ? Number(materialFilter) : undefined;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="MASTER DATA / 02"
        title="零件库"
        description="维护目标零件的切割长度、默认数量和所属原料规格；排料时可临时调整数量。"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => downloadPartsCsv(parts, materials)}
              disabled={parts.length === 0}
            >
              <Download size={16} />
              导出 CSV
            </Button>
            <Button variant="primary" onClick={openCreate} disabled={materials.length === 0}>
              <Plus size={16} />
              新增零件
            </Button>
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

      <div className="stat-grid">
        <StatCard
          label="零件种类"
          value={`${parts.length} 种`}
          sub="可分别设置默认数量"
          icon={<Ruler size={19} />}
        />
        <StatCard
          label="默认总件数"
          value={`${totalPieces} 件`}
          sub="来自零件库默认数量"
          tone="green"
        />
        <StatCard
          label="净下料总长"
          value={`${formatNumber(totalNetLength / 1000, 1)} m`}
          sub={`${formatNumber(totalNetLength, 0)} mm`}
          tone="blue"
        />
        <StatCard
          label="零件估算总重"
          value={formatWeight(totalWeight)}
          sub="按零件长度与原料密度估算"
          tone="accent"
        />
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h3>零件清单</h3>
            <p>单件重量按所属原料的截面和密度估算，不包含切口损耗。</p>
          </div>
          <div className="toolbar-filters">
            <div className="search-box">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索零件编号或名称"
                aria-label="搜索零件"
              />
            </div>
            <Select
              value={materialFilter}
              onChange={(event) => setMaterialFilter(event.target.value)}
              aria-label="按原料筛选"
            >
              <option value="all">全部原料规格</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.code} · {material.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="table-skeleton">
            {[1, 2, 3].map((key) => (
              <div className="skeleton-line" key={key} />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <EmptyState
            icon={<Ruler size={30} />}
            title="还没有原料规格"
            description="零件必须绑定原料规格，请先建立原料库。"
            action={
              <Link to="/materials" className="btn btn-primary btn-md">
                去新增原料规格
              </Link>
            }
          />
        ) : parts.length === 0 ? (
          <EmptyState
            icon={<Ruler size={30} />}
            title="还没有目标零件"
            description="添加需要切割的零件长度与默认数量，排料工作台会自动按原料分组。"
            action={
              <Button variant="primary" onClick={openCreate}>
                <Plus size={16} />
                新增第一个零件
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="empty-inline">
            <Search size={20} />
            <p>没有匹配的零件。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>零件</th>
                  <th>所属原料规格</th>
                  <th>切割长度</th>
                  <th>单件重量</th>
                  <th>默认数量</th>
                  <th>合计重量</th>
                  <th className="align-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((part) => {
                  const material = materialById.get(part.materialId);
                  return (
                    <tr key={part.id}>
                      <td>
                        <div className="cell-title">
                          <span className="material-code">{part.code}</span>
                          <strong>{part.name}</strong>
                        </div>
                        {part.note ? <span className="cell-sub">{part.note}</span> : null}
                      </td>
                      <td>
                        {material ? (
                          <>
                            <strong>{formatMaterialSpec(material)}</strong>
                            <span className="cell-sub">
                              {material.code} · {material.name} · {material.grade}
                            </span>
                          </>
                        ) : (
                          <Badge tone="red">原料规格已删除</Badge>
                        )}
                      </td>
                      <td>
                        {formatNumber(part.length, 1)} mm
                        {material && part.length > material.length - 200 ? (
                          <span className="cell-sub">
                            <Badge tone="red">超激光上限</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td>{material ? formatWeight(tubeWeightKg(material, part.length)) : '—'}</td>
                      <td>
                        <span className="qty-pill">{part.quantity} 件</span>
                      </td>
                      <td>
                        {material
                          ? formatWeight(tubeWeightKg(material, part.length) * part.quantity)
                          : '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <IconButton label="编辑" onClick={() => openEdit(part)}>
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            label="删除"
                            className="danger"
                            onClick={() => void remove(part)}
                            disabled={deletingId === part.id}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PartFormModal
        open={formOpen}
        initial={editing}
        defaultMaterialId={defaultMaterialId}
        onClose={() => setFormOpen(false)}
        onSaved={() => undefined}
      />
    </div>
  );
}
