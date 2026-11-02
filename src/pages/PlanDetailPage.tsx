import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button, PageHeader } from '../components/ui';
import { PlanResultView } from '../components/PlanResultView';
import { ExportDialog } from '../components/ExportDialog';
import { useToast } from '../context/ToastContext';
import { api, getErrorMessage } from '../lib/api';
import { downloadPlanCsv } from '../lib/csv';
import { formatDateTime, formatNumber } from '../../shared/format';
import { METHOD_RULES, type PlanDetail } from '../../shared/types';

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!Number.isInteger(planId) || planId <= 0) {
        setError('无效的方案编号');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await api.plans.get(planId);
        if (!cancelled) setPlan(next);
      } catch (cause) {
        if (!cancelled) setError(getErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const remove = async () => {
    if (!plan) return;
    if (!window.confirm(`确定删除方案「${plan.name}」吗？删除后不可恢复。`)) return;
    setDeleting(true);
    try {
      await api.plans.remove(plan.id);
      toast('方案已删除');
      navigate('/plans');
    } catch (cause) {
      toast(getErrorMessage(cause), 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-stack">
        <div className="panel loading-panel">
          <div className="skeleton-line w40" />
          <div className="skeleton-line w80" />
          <div className="skeleton-line w60" />
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="page-stack">
        <div className="error-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>无法打开方案</strong>
            <span>{error ?? '方案不存在'}</span>
          </div>
          <Link to="/plans" className="btn btn-secondary btn-sm">
            返回方案记录
          </Link>
        </div>
      </div>
    );
  }

  const rule = METHOD_RULES[plan.result.cutMethod];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`ARCHIVE / PC-${String(plan.id).padStart(4, '0')}`}
        title={plan.name}
        description={
          <>
            保存于 {formatDateTime(plan.createdAt)} · {rule.label} · 切口{' '}
            {formatNumber(plan.kerfMm, 2)} mm · 夹持 {formatNumber(plan.clampMm, 0)} mm
          </>
        }
        actions={
          <>
            <Link to="/plans" className="btn btn-ghost btn-md">
              <ArrowLeft size={16} />
              返回
            </Link>
            <Button variant="secondary" onClick={() => downloadPlanCsv(plan.name, plan.result)}>
              <FileSpreadsheet size={16} />
              CSV
            </Button>
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              <Printer size={16} />
              打印 / 导出
            </Button>
            <Button variant="danger" onClick={remove} loading={deleting}>
              <Trash2 size={16} />
              删除
            </Button>
          </>
        }
      />

      <div className="snapshot-note">
        <RefreshCw size={15} />
        这是保存时的方案快照。之后修改原料规格或零件库，不会改变本单的排样与重量。
      </div>

      <PlanResultView result={plan.result} title="排样明细" />

      <ExportDialog
        open={exportOpen}
        name={plan.name}
        result={plan.result}
        planId={plan.id}
        createdAt={plan.createdAt}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
