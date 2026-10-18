import type { DataStatus } from "./market";
import type {
  FinancialHistory,
  InstrumentScore,
  ScreeningAnalysis,
} from "./scoring";

export interface FundamentalMetrics {
  status: DataStatus;
  fetchedAt: string;
  periodEnd: string | null;
  source: string;
  financialCurrency: string | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  marketCap: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  dividendYield: number | null;
  expenseRatio: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  note: string;
  industry?: string | null;
  industryKey?: string | null;
  history?: FinancialHistory;
}

export interface BriefingEvidence {
  id: string;
  label: string;
  value: string;
  symbol: string | null;
  asOf: string | null;
  source: string;
  url: string | null;
  status: DataStatus;
}

export interface MarketBriefing {
  id: string;
  snapshotId: string;
  generatedAt: string;
  dataAsOf: string;
  mode: "live" | "sample";
  engine: "codex" | "sample";
  horizon: "수개월 이상 중장기";
  headline: string;
  summary: string;
  marketView: Array<{
    title: string;
    interpretation: string;
    evidenceIds: string[];
  }>;
  candidates: Array<{
    symbol: string;
    action: "buy" | "sell" | "watch";
    thesis: string;
    reasons: string[];
    risks: string[];
    entryCondition: string;
    exitCondition: string;
    invalidation: string;
    evidenceIds: string[];
    score?: InstrumentScore;
  }>;
  koreaImplications: string;
  currencyView: string;
  limitations: string[];
  evidence: BriefingEvidence[];
  screening?: ScreeningAnalysis;
}

export interface BriefingRun {
  id: string;
  snapshotId: string;
  stage: "generating" | "validating" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface BriefingState {
  report: MarketBriefing | null;
  run: BriefingRun | null;
  matchesSnapshot: boolean;
}
