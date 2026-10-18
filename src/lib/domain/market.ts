export type DataStatus = "fresh" | "stale" | "missing";

export type AssetClass =
  "index" | "equity" | "fx" | "rate" | "commodity" | "crypto";

export type MarketDirection = "up" | "down" | "flat";

export interface MarketPoint {
  id: string;
  symbol: string;
  label: string;
  assetClass: AssetClass;
  value: number | null;
  displayValue: string;
  change: number | null;
  changePercent: number | null;
  displayChange: string;
  direction: MarketDirection;
  currency: string | null;
  asOf: string | null;
  source: string;
  status: DataStatus;
  marketState?: "open" | "closed" | "pre" | "post" | "unknown";
  freshnessReason?: string;
  history?: Array<{ time: string; value: number }>;
  region?: "KR" | "US" | "GLOBAL";
  instrumentType?: "stock" | "etf";
  sector?: string;
  isWatchlist?: boolean;
  fundamentals?: import("./briefing").FundamentalMetrics;
}
