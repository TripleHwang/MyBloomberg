import type { MarketPoint } from "@/lib/domain";

interface MarketTapeProps {
  points: MarketPoint[];
}

function statusLabel(status: MarketPoint["status"]) {
  return status === "stale"
    ? "STALE"
    : status === "missing"
      ? "MISSING"
      : "SAMPLE";
}

export function MarketTape({ points }: MarketTapeProps) {
  return (
    <section className="market-tape" aria-labelledby="market-tape-title">
      <h2 id="market-tape-title" className="sr-only">
        Sample market tape
      </h2>
      <ul>
        {points.map((point) => (
          <li key={point.id} className={`tape-point status-${point.status}`}>
            <div className="tape-label">
              <span>{point.symbol}</span>
              <small>{statusLabel(point.status)}</small>
            </div>
            <div className="tape-value">{point.displayValue}</div>
            <div className={`market-move move-${point.direction}`}>
              <span className="direction-symbol" aria-hidden="true">
                {point.direction === "up"
                  ? "▲"
                  : point.direction === "down"
                    ? "▼"
                    : "■"}
              </span>
              {point.displayChange}
              <span className="sr-only">, {point.direction}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
