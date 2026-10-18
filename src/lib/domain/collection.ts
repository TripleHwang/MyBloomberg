import type { AssetClass, MarketPoint } from "./market";
import type { BriefingState } from "./briefing";
import type { ScreeningAnalysis } from "./scoring";

export type CollectionMode = "live" | "sample";
export type CollectionStage =
  "collecting" | "validating" | "saving" | "completed" | "failed";

export interface InstrumentDefinition {
  id: string;
  symbol: string;
  label: string;
  assetClass: AssetClass;
  currency: string | null;
  region: "KR" | "US" | "GLOBAL";
  provider: "yahoo" | "fred" | "treasury";
  instrumentType?: "stock" | "etf";
  sector?: string;
  isWatchlist?: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  tags: string[];
  score: number;
  timeKind?: "published" | "discovered";
}

export interface SourceHealth {
  id: string;
  label: string;
  kind: "market" | "news";
  status: "ok" | "error" | "unconfigured";
  count: number;
  checkedAt: string;
  message: string;
}

export interface CollectionSnapshot {
  schemaVersion: 1;
  id: string;
  collectedAt: string;
  mode: CollectionMode;
  marketPoints: MarketPoint[];
  news: NewsItem[];
  sources: SourceHealth[];
  screening?: ScreeningAnalysis;
  quality: {
    fresh: number;
    stale: number;
    missing: number;
    newsStatus: "ok" | "degraded" | "unavailable";
    readyForReport: boolean;
    missingCritical: string[];
    warnings: string[];
  };
}

export interface CollectionRun {
  id: string;
  mode: CollectionMode;
  stage: CollectionStage;
  startedAt: string;
  finishedAt: string | null;
  snapshotId: string | null;
  error: string | null;
}

export interface SnapshotSummary {
  id: string;
  collectedAt: string;
  mode: CollectionMode;
  fresh: number;
  stale: number;
  missing: number;
  newsCount: number;
  readyForReport: boolean;
}

export interface DeskCollectionState {
  snapshot: CollectionSnapshot | null;
  run: CollectionRun | null;
  history: SnapshotSummary[];
  config: { fredConfigured: boolean; watchlist: InstrumentDefinition[] };
  briefing?: BriefingState;
  universeCount?: number;
}
