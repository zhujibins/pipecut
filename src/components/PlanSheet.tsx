import { forwardRef } from 'react';
import { BarDiagram } from './BarDiagram';
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatWeight,
} from '../../shared/format';
import { METHOD_RULES, type PlanResult } from '../../shared/types';

interface PlanSheetProps {
  name: string;
  result: PlanResult;
  planId?: number;
  createdAt?: string;
}

export const PlanSheet = forwardRef<HTMLDivElement, PlanSheetProps>(function PlanSheet(
  { name, result, planId, createdAt },
  ref,
) {
  const generatedAt = createdAt ?? result.generatedAt;
  const rule = METHOD_RULES[result.cutMethod];
  const hasWarnings = result.warnings.length > 0 || result.unplaced.length > 0;

  return (
    <div ref={ref} className="plan-sheet">
      <header className="sheet-head">
        <div className="sheet-brand">
          <span className="sheet-logo" aria-hidden="true" />
          <div>
            <strong>管切算</strong>
            <small>PIPECUT · WORKSHOP</small>
          </div>
        </div>
        <div className="sheet-title">
          <h1>管材切割加工单</h1>
          <p>{name}</p>
        </div>
        <div className="sheet-meta">
          <div>
            <span>加工单号</span>
            <strong>{planId ? `PC-${String(planId).padStart(4, '0')}` : '临时单'}</strong>
          </div>
          <div>
            <span>生成时间</span>
            <strong>{formatDateTime(generatedAt)}</strong>
          </div>
        </div>
      </header>

      <div className="sheet-rule" />

      <section className="sheet-overview">
        <div>
          <span>切割方式</span>
          <strong>{rule.label}</strong>
        </div>
        <div>
          <span>切口宽度</span>
          <strong>{formatNumber(result.kerfMm, 2)} mm</strong>
        </div>
        <div>
          <span>夹持余量</span>
          <strong>{formatNumber(result.clampMm, 0)} mm</strong>
        </div>
        <div>
          <span>原料根数</span>
          <strong>{result.totals.stockCount} 根</strong>
        </div>
        <div>
          <span>材料利用率</span>
          <strong>{formatPercent(result.totals.utilization)}</strong>
        </div>
        <div>
          <span>零件总重</span>
          <strong>{formatWeight(result.totals.partWeightKg)}</strong>
        </div>
      </section>

      {hasWarnings ? (
        <section className="sheet-warning">
          <strong>排料提示</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {result.unplaced.map((piece) => (
              <li key={`${piece.partId}-${piece.materialCode}`}>
                {piece.partCode} {piece.partName} × {piece.quantity} 未排入：{piece.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sheet-material-table">
        <table>
          <thead>
            <tr>
              <th>原料编号</th>
              <th>规格</th>
              <th>材质</th>
              <th>库存</th>
              <th>需用</th>
              <th>零件数</th>
              <th>利用率</th>
              <th>余料合计</th>
            </tr>
          </thead>
          <tbody>
            {result.summaries.map((summary) => (
              <tr key={summary.materialId}>
                <td>{summary.materialCode}</td>
                <td>{summary.spec}</td>
                <td>{summary.grade}</td>
                <td>{summary.inventoryQuantity} 根</td>
                <td>
                  {summary.requiredBars} 根
                  {summary.shortageBars > 0 ? (
                    <em className="sheet-shortage">（缺 {summary.shortageBars}）</em>
                  ) : null}
                </td>
                <td>{summary.pieceCount} 件</td>
                <td>{formatPercent(summary.utilization)}</td>
                <td>{formatNumber(summary.leftoverLength, 0)} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="sheet-bars">
        {result.summaries.map((summary) => {
          const bars = result.bars.filter((bar) => bar.materialId === summary.materialId);
          return (
            <section key={summary.materialId} className="sheet-material-block">
              <div className="sheet-material-title">
                <div>
                  <span className="sheet-material-code">{summary.materialCode}</span>
                  <strong>{summary.materialName}</strong>
                  <span className="sheet-material-spec">{summary.spec}</span>
                </div>
                <div className="sheet-material-stats">
                  {summary.grade} · {summary.requiredBars} 根 · 利用率 {formatPercent(summary.utilization)}
                </div>
              </div>

              {bars.map((bar) => (
                <div key={bar.barNo} className="sheet-bar">
                  <div className="sheet-bar-head">
                    <div>
                      <span className="sheet-bar-no">#{String(bar.barNo).padStart(2, '0')}</span>
                      <strong>
                        {bar.pieces.length} 件 / 零件长 {formatNumber(bar.partsLength, 0)} mm
                      </strong>
                    </div>
                    <div>
                      余料 {formatNumber(bar.leftoverLength, 0)} mm · 利用率 {formatPercent(bar.utilization)}
                    </div>
                  </div>

                  <BarDiagram bar={bar} showScale={false} />

                  <div className="sheet-cut-list">
                    {bar.pieces.map((piece) => (
                      <span key={`${bar.barNo}-${piece.sequence}`} className="sheet-cut-item">
                        <b>{piece.sequence}</b>
                        {piece.partCode} {piece.partName}
                        <em>{formatNumber(piece.length, 1)}</em>
                      </span>
                    ))}
                  </div>

                  <div className="sheet-bar-foot">
                    <span>原料 {formatNumber(bar.stockLength, 0)} mm</span>
                    <span>切口 {formatNumber(bar.kerfTotal, 1)} mm</span>
                    <span>余料 {formatNumber(bar.leftoverLength, 1)} mm</span>
                    <span>夹持 {formatNumber(bar.clampLength, 0)} mm</span>
                    <span>单根零件重 {formatWeight(bar.weightKg)}</span>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <footer className="sheet-foot">
        <div className="sheet-notes">
          <strong>加工说明</strong>
          <p>
            1. 尺寸单位均为 mm；下料前请核对原料规格、库存与零件长度。
            {result.cutMethod === 'laser'
              ? ' 激光切割每根原料已预留 200 mm 夹持区，请勿占用。'
              : ' 锯床切割无夹持余量，切口宽度已按设置扣除。'}
          </p>
          <p>
            2. 图示从左至右为下料顺序，深色数字为切割序号；斜纹区域为余料，网格区域为夹持区。
          </p>
          <p>3. 本单由管切算生成，原料利用率按零件净长 / 原料总长计算，重量为估算值。</p>
        </div>
        <div className="sheet-sign">
          <span>操作人：________________</span>
          <span>质检：________________</span>
          <span>日期：________________</span>
        </div>
      </footer>
    </div>
  );
});
