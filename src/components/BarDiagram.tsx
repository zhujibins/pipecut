import { formatNumber } from '../../shared/format';
import type { BarPlan } from '../../shared/types';

const PART_COLORS = [
  '#2f6b4f',
  '#c96a2e',
  '#3f6f8f',
  '#8a5a44',
  '#6b7d3a',
  '#a34d3f',
  '#4c6b8a',
  '#7c5b8f',
];

function colorFor(partId: number): string {
  return PART_COLORS[Math.abs(partId) % PART_COLORS.length];
}

export function BarDiagram({
  bar,
  compact = false,
  showScale = true,
}: {
  bar: BarPlan;
  compact?: boolean;
  showScale?: boolean;
}) {
  const scale = 100 / bar.stockLength;
  const parts = bar.segments.filter((segment) => segment.kind === 'part');
  const kerfs = bar.segments.filter((segment) => segment.kind === 'kerf');
  const leftover = bar.segments.find((segment) => segment.kind === 'leftover');
  const clamp = bar.segments.find((segment) => segment.kind === 'clamp');

  return (
    <div className={`bar-diagram${compact ? ' is-compact' : ''}`}>
      <div className="bar-track">
        {leftover ? (
          <div
            className="bar-seg bar-leftover"
            style={{
              left: `${leftover.start * scale}%`,
              width: `${leftover.length * scale}%`,
            }}
            title={`余料 ${formatNumber(leftover.length, 1)} mm`}
          >
            {leftover.length * scale > 7 ? (
              <span>余 {formatNumber(leftover.length, 0)}</span>
            ) : null}
          </div>
        ) : null}

        {clamp ? (
          <div
            className="bar-seg bar-clamp"
            style={{
              left: `${clamp.start * scale}%`,
              width: `${clamp.length * scale}%`,
            }}
            title={`夹持区 ${formatNumber(clamp.length, 0)} mm`}
          >
            {clamp.length * scale > 4.5 ? <span>夹持</span> : null}
          </div>
        ) : null}

        {parts.map((segment) => {
          const width = segment.length * scale;
          return (
            <div
              key={`part-${segment.sequence}`}
              className="bar-seg bar-part"
              style={{
                left: `${segment.start * scale}%`,
                width: `${width}%`,
                backgroundColor: colorFor(segment.partId ?? 0),
              }}
              title={`${segment.sequence}. ${segment.partCode} ${segment.partName} · ${formatNumber(
                segment.length,
                1,
              )} mm`}
            >
              {width > 6.5 ? (
                <span className="bar-part-label">
                  <b>{segment.sequence}</b>
                  <em>{segment.partCode}</em>
                  {width > 11 ? <i>{formatNumber(segment.length, 0)}</i> : null}
                </span>
              ) : width > 2 ? (
                <span className="bar-seq">{segment.sequence}</span>
              ) : null}
            </div>
          );
        })}

        {kerfs.map((segment) => (
          <span
            key={`kerf-${segment.start}`}
            className="bar-kerf"
            style={{ left: `${segment.start * scale}%` }}
            title={`切口 ${formatNumber(segment.length, 1)} mm`}
          />
        ))}
      </div>

      {showScale ? (
        <div className="bar-scale">
          <span>0</span>
          <span>{formatNumber(bar.stockLength / 2, 0)}</span>
          <span>{formatNumber(bar.stockLength, 0)} mm</span>
        </div>
      ) : null}
    </div>
  );
}
