import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  StatCard,
} from '../components/ui';
import { MaterialFormModal } from '../components/MaterialFormModal';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { api, getErrorMessage } from '../lib/api';
import { downloadMaterialsCsv } from '../lib/csv';
import {
  formatMaterialSpec,
  formatNumber,
  formatWeight,
  profileLabel,
  tubeWeightKg,
} from '../../shared/format';
import type { Material } from '../../shared/types';

export function MaterialsPage() {
  const { materials, loading, error, refreshAll } = useAppData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return materials;
    return materials.filter((material) =>
      `${material.code} ${material.name} ${material.grade}`.toLowerCase().includes(keyword),
    );
  }, [materials, query]);

  const totalBars = materials.reduce((sum, material) => sum + material.quantity, 0);
  const totalLength = materials.reduce(
    (sum, material) => sum + material.length * material.quantity,
    0,
  );
  const totalWeight = materials.reduce(
    (sum, material) => sum + tubeWeightKg(material, material.length) * material.quantity,
    0,
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (material: Material) => {
    setEditing(material);
    setFormOpen(true);
  };

  const loadDemo = async () => {
    setDemoLoading(true);
    try {
      await api.demo.load();
      await refreshAll();
      toast('示例数据已载入');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDemoLoading(false);
    }
  };

  const remove = async (material: Material) => {
    if (
      !window.confirm(
        `确定删除原料规格 ${material.code}（${material.name}）吗？如果该规格下已有零件，需要先处理零件。`,
      )
    ) {
      return;
    }
    setDeletingId(material.id);
    try {
      await api.materials.remove(material.id);
      await refreshAll();
      toast('原料规格已删除');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="MASTER DATA / 01"
        title="原料规格"
        description="维护管材截面、壁厚、长度、材质和库存。排料时只使用这里的规格与库存数据。"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => downloadMaterialsCsv(materials)}
              disabled={materials.length === 0}
            >
              <Download size={16} />
              导出 CSV
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus size={16} />
              新增原料规格
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
          label="原料规格"
          value={`${materials.length} 种`}
          sub="圆管 / 方管 / 矩形管"
          icon={<Layers size={19} />}
        />
        <StatCard
          label="库存根数"
          value={`${totalBars} 根`}
          sub={totalBars === 0 ? '尚未录入库存' : '所有规格合计'}
          tone="green"
        />
        <StatCard
          label="库存总长"
          value={`${formatNumber(totalLength / 1000, 1)} m`}
          sub={`${formatNumber(totalLength, 0)} mm`}
          tone="blue"
        />
        <StatCard
          label="库存估算重量"
          value={formatWeight(totalWeight)}
          sub="按截面与密度估算"
          tone="accent"
        />
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h3>规格清单</h3>
            <p>库存小于排料需求时，方案会给出缺料提示。</p>
          </div>
          <div className="search-box">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索编号、名称或材质"
              aria-label="搜索原料规格"
            />
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
            icon={<Layers size={30} />}
            title="还没有原料规格"
            description="录入第一根管材的截面、壁厚、长度和库存；也可以先载入示例数据。"
            action={
              <div className="empty-actions">
                <Button variant="primary" onClick={openCreate}>
                  <Plus size={16} />
                  新增原料规格
                </Button>
                <Button variant="secondary" onClick={loadDemo} loading={demoLoading}>
                  <Sparkles size={16} />
                  载入示例数据
                </Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="empty-inline">
            <Search size={20} />
            <p>没有匹配的规格。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>规格</th>
                  <th>截面 / 尺寸</th>
                  <th>材质</th>
                  <th>原料长度</th>
                  <th>库存</th>
                  <th>单根重量</th>
                  <th>库存总长</th>
                  <th className="align-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((material) => (
                  <tr key={material.id}>
                    <td>
                      <div className="cell-title">
                        <span className="material-code">{material.code}</span>
                        <strong>{material.name}</strong>
                      </div>
                      {material.note ? <span className="cell-sub">{material.note}</span> : null}
                    </td>
                    <td>
                      <strong>{formatMaterialSpec(material)}</strong>
                      <span className="cell-sub">
                        <Badge tone="gray">{profileLabel(material.profile)}</Badge>
                      </span>
                    </td>
                    <td>
                      <strong>{material.grade}</strong>
                      <span className="cell-sub">ρ {formatNumber(material.density, 2)} g/cm³</span>
                    </td>
                    <td>{formatNumber(material.length, 0)} mm</td>
                    <td>
                      <span className={`stock-count${material.quantity === 0 ? ' is-zero' : ''}`}>
                        {material.quantity} 根
                      </span>
                    </td>
                    <td>{formatWeight(tubeWeightKg(material, material.length))}</td>
                    <td>{formatNumber((material.length * material.quantity) / 1000, 1)} m</td>
                    <td>
                      <div className="row-actions">
                        <IconButton label="编辑" onClick={() => openEdit(material)}>
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton
                          label="删除"
                          className="danger"
                          onClick={() => void remove(material)}
                          disabled={deletingId === material.id}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <MaterialFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => undefined}
      />
    </div>
  );
}
