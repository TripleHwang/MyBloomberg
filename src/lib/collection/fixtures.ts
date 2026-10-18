import type {
  CollectionSnapshot,
  InstrumentDefinition,
} from "../domain/collection";
import { makePoint } from "../market-data/normalize";
import { makeNews } from "../news/normalize";
import { assessQuality } from "./quality";

// Deterministic fictional fixtures. These never enter the live cache.
export function fixtureSnapshot(
  id: string,
  instruments: InstrumentDefinition[],
  now: Date,
): CollectionSnapshot {
  const bases: Record<string, number> = {
    kospi: 2764.31,
    kosdaq: 812.44,
    sp500: 5634.61,
    nasdaq: 17863.23,
    dow: 41243.12,
    usdkrw: 1382.4,
    us2y: 3.97,
    us10y: 4.21,
    gold: 2458.9,
    wti: 76.18,
    btc: 68420,
    "watch-005930.KS": 74800,
    "watch-000660.KS": 191500,
    "watch-NVDA": 127.52,
    "watch-TSM": 173.44,
  };
  const marketPoints = instruments.map((instrument, index) => {
    const value =
      bases[instrument.id] ??
      bases[`watch-${instrument.symbol}`] ??
      (instrument.assetClass === "fx" ? 1.1 + index * 0.01 : 100 + index * 4);
    const changePercent = [
      0.67, -0.32, 0.28, -0.61, 0.18, 0.38, 0.04, 0.04, 0.9, -0.7, 1.35, 0.9,
      1.7, -0.4, 0.8,
    ][index % 15];
    const asOf = new Date(
      now.getTime() - (index === 5 ? 90 : 10) * 60_000,
    ).toISOString();
    const history = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(now.getTime() - (19 - i) * 86_400_000).toISOString(),
      value: Number(
        (value * (0.94 + i * 0.003 + Math.sin(i + index) * 0.009)).toFixed(3),
      ),
    }));
    history[19].value = value;
    const point = makePoint(
      instrument,
      {
        value,
        change:
          instrument.assetClass === "rate"
            ? 0.04
            : (value * changePercent) / 100,
        changePercent: instrument.assetClass === "rate" ? null : changePercent,
        asOf,
        source: "SAMPLE · 가상 데이터",
        history,
      },
      now,
    );
    if (instrument.assetClass === "equity")
      point.fundamentals = {
        status: "fresh",
        fetchedAt: now.toISOString(),
        periodEnd:
          instrument.instrumentType === "etf"
            ? null
            : new Date(now.getTime() - 100 * 86_400_000)
                .toISOString()
                .slice(0, 10),
        source: "SAMPLE · 가상 재무 자료",
        financialCurrency: instrument.currency,
        trailingPE: 18 + (index % 25),
        forwardPE: 17 + (index % 20),
        priceToBook: 2 + (index % 6),
        marketCap: 100_000_000_000 + index * 1_000_000_000,
        revenueGrowth: index % 2 ? 0.12 : -0.02,
        earningsGrowth: index % 2 ? 0.16 : -0.08,
        profitMargins: 0.15,
        returnOnEquity: 0.18,
        debtToEquity: index % 2 ? 25 : 120,
        freeCashflow: 2_000_000_000,
        dividendYield: 0.02,
        expenseRatio: instrument.instrumentType === "etf" ? 0.001 : null,
        fiftyTwoWeekHigh: value * 1.2,
        fiftyTwoWeekLow: value * 0.7,
        note: "실제 기업과 무관한 가상 지표입니다.",
      };
    if (point.fundamentals && instrument.instrumentType !== "etf") {
      const lastYear = now.getUTCFullYear() - 1;
      const weak = index % 5 === 0;
      const group = instrument.sector || "반도체";
      point.fundamentals.industry = `SAMPLE · ${group}`;
      point.fundamentals.industryKey = `sample-${group}`;
      point.fundamentals.history = {
        status: "fresh",
        fetchedAt: now.toISOString(),
        source: "SAMPLE · 가상 연간 재무",
        currency: instrument.currency,
        periods: Array.from({ length: 4 }, (_, year) => {
          const revenue = 100_000_000_000 * (weak ? 0.85 : 1.15) ** year;
          return {
            periodEnd: `${lastYear - 3 + year}-12-31`,
            revenue,
            netIncome: revenue * (weak ? -0.05 : 0.18 + year * 0.01),
            operatingCashFlow: revenue * 0.25,
            capitalExpenditure: -revenue * 0.08,
            freeCashFlow: revenue * (weak ? -0.12 : 0.17),
            totalDebt: 10_000_000_000 * (weak ? 2 ** year : 1),
            totalEquity: 40_000_000_000 + year * 8_000_000_000,
            totalAssets: 100_000_000_000 + year * 10_000_000_000,
          };
        }),
        notes: ["SAMPLE · 실제 기업의 재무제표와 무관한 가상 데이터입니다."],
      };
    }
    return {
      ...point,
      status: index === 5 ? ("stale" as const) : ("fresh" as const),
      freshnessReason:
        index === 5
          ? "샘플 시나리오 · 90분 지연 상태"
          : "샘플 시나리오 · 가상 관측값",
      marketState: "closed" as const,
    };
  });
  const titles = [
    "[샘플] 연준 통화정책 발표와 미국 금리 확인",
    "[샘플] 한국 시장 개장을 앞둔 원화 움직임",
    "[샘플] Nvidia·TSMC 반도체 업종 점검",
    "[샘플] 국제 원유 가격과 원자재 시장 동향",
    "[샘플] 한국은행 금융시장 주요 지표",
    "[샘플] Bitcoin 시장 24시간 흐름",
  ];
  const domains = [
    "federalreserve.gov",
    "bok.or.kr",
    "sec.gov",
    "home.treasury.gov",
    "bok.or.kr",
    "sec.gov",
  ];
  const news = titles.flatMap((title, i) => {
    const item = makeNews({
      title,
      url: `https://www.${domains[i]}/`,
      source: `SAMPLE / ${domains[i]}`,
      publishedAt: new Date(now.getTime() - (i + 1) * 3_600_000).toISOString(),
      summary:
        "화면과 수집 흐름을 체험하기 위한 가상 뉴스입니다. 실제 보도나 시장 해설이 아니며 링크는 해당 기관 홈페이지입니다.",
      official: true,
    });
    return item ? [{ ...item, id: `sample-news-${i}` }] : [];
  });
  const sources = [
    {
      id: "sample-market",
      label: "샘플 시세",
      kind: "market" as const,
      status: "ok" as const,
      count: marketPoints.length,
      checkedAt: now.toISOString(),
      message: "네트워크 없이 생성한 가상 시세",
    },
    {
      id: "sample-news",
      label: "샘플 뉴스",
      kind: "news" as const,
      status: "ok" as const,
      count: news.length,
      checkedAt: now.toISOString(),
      message: "네트워크 없이 생성한 가상 뉴스",
    },
  ];
  return {
    schemaVersion: 1,
    id,
    collectedAt: now.toISOString(),
    mode: "sample",
    marketPoints,
    news,
    sources,
    quality: assessQuality(marketPoints, sources),
  };
}
