import type { DeskStatus } from "@/lib/domain";

interface StatusBarProps {
  status: DeskStatus;
}

export function StatusBar({ status }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div>
        <span className={`status-chip status-${status.quoteStatus}`}>
          {status.quoteStatus.toUpperCase()} DATA
        </span>
        <span>ALL VALUES ARE SAMPLE · NOT LIVE QUOTES</span>
      </div>
      <div>
        <span>AS OF {status.dataAsOf}</span>
        <span>{status.reportId}</span>
        <span>{status.scaffoldPhase}</span>
      </div>
    </footer>
  );
}
