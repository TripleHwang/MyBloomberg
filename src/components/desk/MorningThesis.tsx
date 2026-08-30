import type { MorningThesisSummary } from "@/lib/domain";

interface MorningThesisProps {
  thesis: MorningThesisSummary;
}

export function MorningThesis({ thesis }: MorningThesisProps) {
  return (
    <article className="morning-thesis" aria-labelledby="thesis-title">
      <header className="section-heading">
        <p>{thesis.eyebrow}</p>
        <span>{thesis.asOfLabel}</span>
      </header>
      <div className="thesis-body">
        <span className="thesis-number" aria-hidden="true">
          01
        </span>
        <div>
          <h1 id="thesis-title">{thesis.headline}</h1>
          <p>{thesis.summary}</p>
        </div>
      </div>
      <div
        className="conviction"
        aria-label={`Conviction ${thesis.conviction} out of 100`}
      >
        <div className="conviction-copy">
          <span>CONVICTION</span>
          <strong>{thesis.conviction}</strong>
          <small>/ 100</small>
        </div>
        <div
          className="conviction-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={thesis.conviction}
        >
          <span style={{ width: `${thesis.conviction}%` }} />
        </div>
      </div>
    </article>
  );
}
