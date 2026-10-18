import type {
  FinancialHistory,
  InstrumentScore,
  ScreeningAnalysis,
} from "@/lib/domain/scoring";

export function scoreFixture(
  symbol = "ACME",
  overrides: Partial<InstrumentScore> = {},
): InstrumentScore {
  return {
    symbol,
    name: symbol === "ACME" ? "Acme Corporation" : symbol,
    kind: "stock",
    model: "corporate",
    baseScore: 68,
    totalScore: 70,
    coverage: 100,
    eligible: true,
    action: "buy",
    rank: 1,
    components: [
      {
        key: "growth",
        label: "성장",
        weight: 20,
        points: 15,
        coverage: 100,
        metrics: [
          {
            key: "revenueCagr",
            label: "매출 CAGR",
            value: 0.1,
            unit: "percent",
            points: 15,
            maxPoints: 20,
            explanation: "실제 연간 결산 네 개로 계산했습니다.",
          },
        ],
      },
    ],
    trend: {
      years: 4,
      firstPeriod: "2022-12-31",
      lastPeriod: "2025-12-31",
      currency: "USD",
      revenueCagr: 0.1,
      earningsCagr: null,
      positiveIncomeYears: 3,
      positiveFcfYears: 4,
      notes: ["순이익 CAGR은 기준 연도 손실로 계산하지 않았습니다."],
    },
    peers: {
      groupKey: "software",
      groupLabel: "Software",
      source: "Yahoo industry",
      count: 2,
      symbols: ["BBB", "CCC"],
      metrics: [
        {
          key: "pe",
          label: "PER",
          value: 20,
          median: 25,
          percentile: 50,
          sampleSize: 2,
          unit: "ratio",
          members: [
            {
              symbol: "BBB",
              name: "Beta Corp",
              value: 20,
              periodEnd: "2025-12-31",
            },
            {
              symbol: "CCC",
              name: "Gamma Corp",
              value: 30,
              periodEnd: "2025-09-30",
            },
          ],
        },
      ],
      notes: ["동일 산업의 대상 외 두 회사를 비교했습니다."],
    },
    news: {
      adjustment: 2,
      status: "matched",
      beforeAction: "watch",
      changedAction: true,
      items: [
        {
          newsId: "n1",
          title: "Acme earnings beat estimates",
          source: "Example News",
          url: "https://example.com/earnings",
          publishedAt: "2026-10-18T00:00:00Z",
          match: "company",
          matchedTerms: ["Acme"],
          direction: "positive",
          ruleIds: ["earnings-beat"],
          rawContribution: 2,
          contribution: 2,
          explanation: "기업명과 실적 상회 조건이 함께 일치했습니다.",
        },
        {
          newsId: "n2",
          title: "Software industry update",
          source: "Example News",
          url: "https://example.com/software",
          publishedAt: "2026-10-18T00:00:00Z",
          match: "industry",
          matchedTerms: ["Software"],
          direction: "neutral",
          ruleIds: [],
          rawContribution: 0,
          contribution: 0,
          explanation: "산업명만 일치했으며 가감 규칙은 충족하지 않았습니다.",
        },
      ],
      notes: ["뉴스 가감은 ±5점으로 제한합니다."],
    },
    blockers: [],
    warnings: [],
    ...overrides,
  };
}
export function screeningFixture(
  scores: InstrumentScore[] = [scoreFixture()],
): ScreeningAnalysis {
  return {
    modelVersion: "balanced-v1",
    profile: "balanced",
    inputHash: "abc123def456immutable",
    asOf: "2026-10-18T00:00:00Z",
    weights: [{ key: "growth", label: "성장", weight: 20 }],
    buyThreshold: 70,
    sellThreshold: 40,
    newsLimit: 5,
    minAnnualPeriods: 3,
    minPeers: 2,
    minCoverage: 80,
    scores,
    selected: scores
      .slice(0, 12)
      .map((score) => ({ symbol: score.symbol, action: score.action })),
    notes: [],
  };
}
export const annualFixture: FinancialHistory = {
  status: "fresh",
  fetchedAt: "2026-10-18T00:00:00Z",
  source: "Yahoo annual financials",
  currency: "USD",
  periods: [2022, 2023, 2024, 2025].map((year, index) => ({
    periodEnd: `${year}-12-31`,
    revenue: index === 0 ? null : index === 1 ? 0 : 1_000_000 * index,
    netIncome: 100_000,
    operatingCashFlow: 200_000,
    capitalExpenditure: -50_000,
    freeCashFlow: 150_000,
    totalDebt: null,
    totalEquity: 500_000,
    totalAssets: 700_000,
  })),
  notes: ["공급자가 제공한 실제 네 개 결산을 표시합니다."],
};
