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
}
