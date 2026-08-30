import type { MarketPulseSummary } from "@/lib/domain";

interface MarketPulseProps {
  pulse: MarketPulseSummary;
}

export function MarketPulse({ pulse }: MarketPulseProps) {
  return (
    <section className="market-pulse" aria-labelledby="pulse-title">
      <header className="section-heading">
        <p id="pulse-title">MARKET PULSE</p>
        <span>COMPOSITE · SAMPLE</span>
      </header>
      <div className="risk-readout">
        <div
          className="risk-dial"
          aria-label={`Risk score ${pulse.riskScore} out of 100`}
        >
          <span>RISK</span>
          <strong>{pulse.riskScore}</strong>
          <small>/ 100</small>
        </div>
        <div>
          <span className="pulse-caption">REGIME</span>
          <p>{pulse.regime}</p>
        </div>
      </div>
      <dl className="pulse-factors">
        {pulse.factors.map((factor) => (
          <div key={factor.label}>
            <dt>{factor.label}</dt>
            <dd className={`move-${factor.direction}`}>{factor.value}</dd>
            <small>{factor.note}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}
