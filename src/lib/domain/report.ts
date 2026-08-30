import type { DataStatus, MarketDirection } from "./market";

export interface MorningThesisSummary {
  eyebrow: string;
  headline: string;
  summary: string;
  conviction: number;
  asOfLabel: string;
}

export interface PulseFactor {
  label: string;
  value: string;
  direction: MarketDirection;
  note: string;
}

export interface MarketPulseSummary {
  regime: string;
  riskScore: number;
  factors: PulseFactor[];
}

export interface CrossAssetPoint {
  label: string;
  equity: number;
  rates: number;
  dollar: number;
}

export type SignalTone = "positive" | "negative" | "neutral" | "watch";

export interface SignalRow {
  factor: string;
  signal: string;
  reading: string;
  interpretation: string;
  tone: SignalTone;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  move: string;
  direction: MarketDirection;
  condition: string;
  status: DataStatus;
}

export interface CalendarEvent {
  time: string;
  region: "KR" | "US" | "CN" | "GLOBAL";
  event: string;
  relevance: "high" | "medium" | "low";
}

export interface DeskStatus {
  mode: "sample";
  agent: "offline" | "ready" | "running";
  quoteStatus: DataStatus;
  dataAsOf: string;
  reportId: string;
  scaffoldPhase: string;
}
