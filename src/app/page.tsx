import { SignalDesk } from "@/components/desk";
import {
  sampleCalendar,
  sampleCrossAsset,
  sampleDeskStatus,
  sampleMarketPoints,
  samplePulse,
  sampleSignals,
  sampleThesis,
  sampleWatchlist,
} from "@/lib/sample-data";

export default function HomePage() {
  return (
    <SignalDesk
      marketPoints={sampleMarketPoints}
      thesis={sampleThesis}
      pulse={samplePulse}
      crossAsset={sampleCrossAsset}
      signals={sampleSignals}
      watchlist={sampleWatchlist}
      calendar={sampleCalendar}
      status={sampleDeskStatus}
    />
  );
}
