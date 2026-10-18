export interface AnnualFinancialPeriod {
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  totalAssets: number | null;
}

export interface FinancialHistory {
  status: "fresh" | "stale" | "missing";
  fetchedAt: string;
  source: string;
  currency: string | null;
  periods: AnnualFinancialPeriod[];
  notes: string[];
}

export interface ScoringMetric {
  key: string;
  label: string;
  value: number | null;
  unit: "percent" | "ratio" | "years" | "number";
  points: number | null;
  maxPoints: number;
  explanation: string;
}

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  points: number | null;
  coverage: number;
  metrics: ScoringMetric[];
}

export interface PeerMetric {
  key: string;
  label: string;
  value: number | null;
  median: number | null;
  percentile: number | null;
  sampleSize: number;
  unit: "percent" | "ratio";
  members: Array<{
    symbol: string;
    name: string;
    value: number;
    periodEnd?: string | null;
  }>;
}

export interface PeerComparison {
  groupKey: string | null;
  groupLabel: string;
  source: string;
  count: number;
  symbols: string[];
  metrics: PeerMetric[];
  notes: string[];
}

export interface NewsContribution {
  newsId: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  match: "company" | "industry";
  matchedTerms: string[];
  direction: "positive" | "negative" | "mixed" | "neutral";
  ruleIds: string[];
  rawContribution: number;
  contribution: number;
  explanation: string;
}

export interface NewsImpact {
  adjustment: number;
  status: "matched" | "no-match" | "unavailable";
  beforeAction: "buy" | "sell" | "watch";
  changedAction: boolean;
  items: NewsContribution[];
  notes: string[];
}

export interface FinancialTrendSummary {
  years: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  currency: string | null;
  revenueCagr: number | null;
  earningsCagr: number | null;
  positiveIncomeYears: number;
  positiveFcfYears: number;
  notes: string[];
}

export interface InstrumentScore {
  symbol: string;
  name: string;
  kind: "stock" | "etf";
  model: "corporate" | "financial" | "etf";
  baseScore: number | null;
  totalScore: number | null;
  coverage: number;
  eligible: boolean;
  action: "buy" | "sell" | "watch";
  actionReasons?: string[];
  rank: number | null;
  components: ScoreComponent[];
  trend: FinancialTrendSummary;
  peers: PeerComparison;
  news: NewsImpact;
  blockers: string[];
  warnings: string[];
}

export interface ScreeningAnalysis {
  modelVersion: string;
  profile: "balanced";
  inputHash: string;
  asOf: string;
  weights: Array<{ key: string; label: string; weight: number }>;
  buyThreshold: number;
  sellThreshold: number;
  newsLimit: number;
  minAnnualPeriods: number;
  minPeers: number;
  minCoverage: number;
  scores: InstrumentScore[];
  selected: Array<{ symbol: string; action: "buy" | "sell" | "watch" }>;
  notes: string[];
}
