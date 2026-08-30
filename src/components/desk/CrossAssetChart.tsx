import type { CrossAssetPoint } from "@/lib/domain";

interface CrossAssetChartProps {
  points: CrossAssetPoint[];
}

function makePath(
  points: CrossAssetPoint[],
  key: keyof Omit<CrossAssetPoint, "label">,
) {
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - point[key];
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function CrossAssetChart({ points }: CrossAssetChartProps) {
  return (
    <figure className="cross-asset" aria-labelledby="cross-asset-title">
      <header className="section-heading">
        <p id="cross-asset-title">CROSS-ASSET PRESSURE</p>
        <span>7 SESSION INDEX · SAMPLE</span>
      </header>
      <div className="chart-legend" aria-label="Chart legend">
        <span className="legend-equity">EQUITY</span>
        <span className="legend-rates">RATES</span>
        <span className="legend-dollar">DOLLAR</span>
      </div>
      <div className="chart-wrap">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
          <title>Cross asset pressure sample chart</title>
          <desc>
            Rates and dollar pressure rise while equity pressure weakens across
            seven sessions.
          </desc>
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} className="grid-line" />
          ))}
          <path d={makePath(points, "equity")} className="line-equity" />
          <path d={makePath(points, "rates")} className="line-rates" />
          <path d={makePath(points, "dollar")} className="line-dollar" />
        </svg>
        <div className="chart-axis" aria-hidden="true">
          {points.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>
      <figcaption>
        금리·달러 압력이 동반 상승. 주식 위험선호는 완만하게 약화되는 구간.
      </figcaption>
    </figure>
  );
}
