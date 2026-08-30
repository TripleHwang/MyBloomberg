import type { DeskStatus } from "@/lib/domain";

interface UtilityBarProps {
  status: DeskStatus;
}

export function UtilityBar({ status }: UtilityBarProps) {
  return (
    <header className="utility-bar">
      <div className="mobile-mark" aria-label="MyBloomberg">
        M<span>/</span>B
      </div>
      <div className="edition">
        <strong>MORNING</strong>
        <span>/ 001</span>
      </div>
      <div className="utility-meta">
        <span>30 AUG 2026</span>
        <time dateTime="2026-08-30T07:30:00+09:00">07:30 SEOUL</time>
        <span className="sample-flag">SAMPLE</span>
        <span className={`agent-state agent-${status.agent}`}>
          <i aria-hidden="true" /> LOCAL AGENT {status.agent.toUpperCase()}
        </span>
      </div>
    </header>
  );
}
