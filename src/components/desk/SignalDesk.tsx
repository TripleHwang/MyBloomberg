import type {
  CalendarEvent,
  CrossAssetPoint,
  DeskStatus,
  MarketPoint,
  MarketPulseSummary,
  MorningThesisSummary,
  SignalRow,
  WatchlistItem,
} from "@/lib/domain";
import { CrossAssetChart } from "./CrossAssetChart";
import { DeskRail } from "./DeskRail";
import { MarketPulse } from "./MarketPulse";
import { MarketTape } from "./MarketTape";
import { MorningThesis } from "./MorningThesis";
import { OnDeck } from "./OnDeck";
import { SignalMatrix } from "./SignalMatrix";
import { StatusBar } from "./StatusBar";
import { UtilityBar } from "./UtilityBar";

interface SignalDeskProps {
  marketPoints: MarketPoint[];
  thesis: MorningThesisSummary;
  pulse: MarketPulseSummary;
  crossAsset: CrossAssetPoint[];
  signals: SignalRow[];
  watchlist: WatchlistItem[];
  calendar: CalendarEvent[];
  status: DeskStatus;
}

export function SignalDesk(props: SignalDeskProps) {
  return (
    <div className="signal-desk">
      <a className="skip-link" href="#desk-main">
        Skip to market summary
      </a>
      <DeskRail />
      <main id="desk-main" className="desk-main">
        <UtilityBar status={props.status} />
        <MarketTape points={props.marketPoints} />
        <div className="desk-grid">
          <MorningThesis thesis={props.thesis} />
          <MarketPulse pulse={props.pulse} />
          <CrossAssetChart points={props.crossAsset} />
          <SignalMatrix signals={props.signals} />
          <OnDeck watchlist={props.watchlist} calendar={props.calendar} />
        </div>
        <StatusBar status={props.status} />
      </main>
    </div>
  );
}
