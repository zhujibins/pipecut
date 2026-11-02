import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  Percent,
  Plus,
  RefreshCw,
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
import { useToast } from '../context/ToastContext';
import { api, getErrorMessage } from '../lib/api';
import { formatDateTime, formatNumber, formatPercent, formatWeight } from '../../shared/format';
import { METHOD_RULES, type PlanSummary } from '../../shared/types';

export function PlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await api.plans.list());
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const totalBars = plans.reduce((sum, plan) => sum + plan.totalBars, 0);
    const avgUtilization =
      plans.length > 0 ? plans.reduce((sum, plan) => sum + plan.utilization, 0) / plans.length : 0;
    return { totalBars, avgUtilization };
  }, [plans]);

  const remove = async (plan: PlanSummary) => {
    if (!window.confirm(`确定删除方案「${plan.name}」吗？删除后不可恢复。`)) return;
    setDeletingId(plan.id);
    try {
      await api.plans.remove(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      toast('方案已删除');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ARCHIVE / 01"
        title="方案记录"
        description="每次保存都会冻结当时的原料、零件和排样结果，可直接重新打印加工单。"
        actions={
          <Link to="/" className="btn btn-primary btn-md">
            <Plus size={16} />
            新建排料
          </Link>
        }
      />

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>方案加载失败</strong>
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={15} />
            重试
          </Button>
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard
          label="已保存方案"
          value={`${plans.length} 份`}
          sub="快照不可变，可重复导出"
          icon={<FileText size={19} />}
        />
        <StatCard
          label="累计原料"
          value={`${stats.totalBars} 根`}
          sub="所有方案合计"
          tone="green"
          icon={<Layers size={19} />}
        />
        <StatCard
          label="平均利用率"
          value={formatPercent(stats.avgUtilization)}
          sub="按方案简单平均"
          tone="blue"
          icon={<Percent size={19} />}
        />
        <StatCard
          label="最近保存"
          value={plans[0] ? formatDateTime(plans[0].createdAt).slice(0, 16) : '—'}
          sub={plans[0]?.name ?? '还没有方案'}
          tone="accent"
          icon={<Clock size={19} />}
        />
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h3>方案清单</h3>
            <p>点击方案名称查看逐根排样、切割明细并重新导出。</p>
          </div>
        </div>

        {loading ? (
          <div className="table-skeleton">
            {[1, 2, 3].map((key) => (
              <div className="skeleton-line" key={key} />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={<FileText size={30} />}
            title="还没有保存过方案"
            description="在排料工作台完成计算后点击“保存方案”，就能在这里随时重新打开和打印。"
            action={
              <Link to="/" className="btn btn-primary btn-md">
                <Plus size={16} />
                去排料
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table plans-table">
              <thead>
                <tr>
                  <th>方案名称</th>
                  <th>切割方式</th>
                  <th>原料根数</th>
                  <th>零件数</th>
                  <th>利用率</th>
                  <th>零件重量</th>
                  <th>保存时间</th>
                  <th className="align-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <Link to={`/plans/${plan.id}`} className="plan-name-link">
                        {plan.name}
                        <ChevronRight size={14} />
                      </Link>
                      <span className="cell-sub">
                        PC-{String(plan.id).padStart(4, '0')} · 切口 {formatNumber(plan.kerfMm, 2)} mm
                      </span>
                    </td>
                    <td>
                      <Badge tone={plan.cutMethod === 'laser' ? 'blue' : 'orange'}>
                        {METHOD_RULES[plan.cutMethod].label}
                      </Badge>
                    </td>
                    <td>{plan.totalBars} 根</td>
                    <td>{plan.pieceCount} 件</td>
                    <td>{formatPercent(plan.utilization)}</td>
                    <td>{formatWeight(plan.partWeightKg)}</td>
                    <td>{formatDateTime(plan.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <IconButton
                          label="删除方案"
                          className="danger"
                          onClick={() => void remove(plan)}
                          disabled={deletingId === plan.id}
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
    </div>
  );
}
