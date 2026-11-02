import type { ReactNode } from 'react';
import {
  Layers,
  Percent,
  Ruler,
  Scissors,
  TriangleAlert,
  Weight,
} from 'lucide-react';
import { BarDiagram } from './BarDiagram';
import { Badge, StatCard } from './ui';
import {
  formatNumber,
  formatPercent,
  formatWeight,
} from '../../shared/format';
import { METHOD_RULES, type PlanResult } from '../../shared/types';

function utilizationTone(value: number): 'green' | 'orange' | 'red' {
  if (value >= 0.82) return 'green';
  if (value >= 0.65) return 'orange';
  return 'red';
}

export function PlanResultView({
  result,
  actions,
  title = '排料结果',
}: {
  result: PlanResult;
  actions?: ReactNode;
  title?: string;
}) {
  const rule = METHOD_RULES[result.cutMethod];
  const inventoryTotal = result.summaries.reduce(
    (sum, summary) => sum + summary.inventoryQuantity,
    0,
  );
  const shortageTotal = result.summaries.reduce(
    (sum, summary) => sum + summary.shortageBars,
    0,
  );

  return (
    <div className="plan-result">
      <div className="result-head">
        <div>
          <div className="eyebrow">CUTTING PLAN</div>
          <h2>{title}</h2>
          <p>
            {rule.label} · 切口 {formatNumber(result.kerfMm, 2)} mm · 夹持余量{' '}
            {formatNumber(result.clampMm, 0)} mm · 按库存核算
          </p>
        </div>
        {actions ? <div className="result-actions">{actions}</div> : null}
      </div>

      <div className="stat-grid">
        <StatCard
          label="需用原料"
          value={`${result.totals.stockCount} 根`}
          sub={
            shortageTotal > 0
              ? `库存 ${inventoryTotal} 根 · 缺 ${shortageTotal} 根`
              : `库存 ${inventoryTotal} 根 · 库存充足`
          }
          icon={<Layers size={19} />}
          tone={shortageTotal > 0 ? 'accent' : 'default'}
        />
        <StatCard
          label="材料利用率"
          value={formatPercent(result.totals.utilization)}
          sub={`零件净长 ${formatNumber(result.totals.partsLength, 0)} mm`}
          icon={<Percent size={19} />}
          tone="green"
        />
        <StatCard
          label="零件总重"
          value={formatWeight(result.totals.partWeightKg)}
          sub={`${result.totals.pieceCount} 件 · 估算值`}
          icon={<Weight size={19} />}
          tone="blue"
        />
        <StatCard
          label="余料总长"
          value={`${formatNumber(result.totals.leftoverLength, 0)} mm`}
          sub={`夹持区 ${formatNumber(result.totals.clampTotal, 0)} mm · 切口 ${formatNumber(
            result.totals.kerfTotal,
            0,
          )} mm`}
          icon={<Ruler size={19} />}
        />
      </div>

      {result.warnings.length > 0 || result.unplaced.length > 0 ? (
        <div className="warning-panel">
          <div className="warning-title">
            <TriangleAlert size={18} />
            排料提示
          </div>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {result.unplaced.length > 0 ? (
            <div className="table-wrap unplaced-table">
              <table>
                <thead>
                  <tr>
                    <th>未排入零件</th>
                    <th>数量</th>
                    <th>原料</th>
                    <th>切割长度</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unplaced.map((piece) => (
                    <tr key={`${piece.partId}-${piece.materialCode}`}>
                      <td>
                        <strong>{piece.partCode}</strong> {piece.partName}
                      </td>
                      <td>{piece.quantity}</td>
                      <td>{piece.materialCode}</td>
                      <td>{formatNumber(piece.length, 1)} mm</td>
                      <td>{piece.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="panel result-material-panel">
        <div className="panel-head">
          <div>
            <h3>原料使用汇总</h3>
            <p>按原料规格分别核算库存、根数与利用率。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>原料</th>
                <th>规格</th>
                <th>需用 / 库存</th>
                <th>零件数</th>
                <th>利用率</th>
                <th>余料</th>
                <th>零件重</th>
              </tr>
            </thead>
            <tbody>
              {result.summaries.map((summary) => (
                <tr key={summary.materialId}>
                  <td>
                    <strong>{summary.materialCode}</strong>
                    <span className="cell-sub">{summary.materialName}</span>
                  </td>
                  <td>{summary.spec}</td>
                  <td>
                    {summary.requiredBars} / {summary.inventoryQuantity} 根
                    {summary.shortageBars > 0 ? (
                      <span className="cell-danger">缺 {summary.shortageBars}</span>
                    ) : null}
                  </td>
                  <td>{summary.pieceCount} 件</td>
                  <td>
                    <Badge tone={utilizationTone(summary.utilization)}>
                      {formatPercent(summary.utilization)}
                    </Badge>
                  </td>
                  <td>{formatNumber(summary.leftoverLength, 0)} mm</td>
                  <td>{formatWeight(summary.partWeightKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bars-section">
        <div className="section-title-row">
          <div>
            <h3>逐根排样</h3>
            <p>从左到右为切割顺序；斜纹为余料，网格为夹持区。</p>
          </div>
          <span className="section-count">{result.bars.length} 根原料</span>
        </div>

        {result.bars.length === 0 ? (
          <div className="panel empty-inline">
            <Scissors size={22} />
            <p>没有生成可执行的排样，请检查上面提示。</p>
          </div>
        ) : (
          <div className="bar-list">
            {result.bars.map((bar) => (
              <article className="bar-card" key={bar.barNo}>
                <header className="bar-card-head">
                  <div className="bar-card-title">
                    <span className="bar-no">#{String(bar.barNo).padStart(2, '0')}</span>
                    <div>
                      <strong>
                        {bar.materialCode} · {bar.materialName}
                      </strong>
                      <span>
                        {bar.spec} · {bar.grade}
                      </span>
                    </div>
                  </div>
                  <div className="bar-card-meta">
                    <Badge tone={utilizationTone(bar.utilization)}>
                      利用率 {formatPercent(bar.utilization)}
                    </Badge>
                    <span>余料 {formatNumber(bar.leftoverLength, 0)} mm</span>
                  </div>
                </header>

                <BarDiagram bar={bar} />

                <div className="cut-chips">
                  {bar.pieces.map((piece) => (
                    <span className="cut-chip" key={`${bar.barNo}-${piece.sequence}`}>
                      <b>{piece.sequence}</b>
                      {piece.partCode}
                      <em>{formatNumber(piece.length, 0)}</em>
                    </span>
                  ))}
                  <span className="cut-chip is-waste">
                    余料
                    <em>{formatNumber(bar.leftoverLength, 0)}</em>
                  </span>
                  {bar.clampLength > 0 ? (
                    <span className="cut-chip is-clamp">
                      夹持
                      <em>{formatNumber(bar.clampLength, 0)}</em>
                    </span>
                  ) : null}
                </div>

                <details className="bar-details">
                  <summary>切割明细（{bar.pieces.length} 件）</summary>
                  <div className="table-wrap">
                    <table className="data-table compact">
                      <thead>
                        <tr>
                          <th>序号</th>
                          <th>零件编号</th>
                          <th>名称</th>
                          <th>切割长度</th>
                          <th>单件重量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bar.pieces.map((piece) => (
                          <tr key={`${bar.barNo}-detail-${piece.sequence}`}>
                            <td>{piece.sequence}</td>
                            <td>{piece.partCode}</td>
                            <td>{piece.partName}</td>
                            <td>{formatNumber(piece.length, 1)} mm</td>
                            <td>{formatWeight(piece.weightKg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="result-footnote">
        <Scissors size={15} />
        切割顺序以图示为准；首件建议试切并复核切口宽度。夹持区在每根原料末端，不可用于下料。
      </div>
    </div>
  );
}
