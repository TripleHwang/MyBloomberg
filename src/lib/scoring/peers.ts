import type { MarketPoint } from "../domain/market";
import type {
  PeerComparison,
  PeerMetric,
  ScoreComponent,
} from "../domain/scoring";
import {
  annualPeriods,
  compare,
  component,
  deriveFinancials,
  finite,
  median,
  metric,
  round,
} from "./financials";

const etfGroups: Record<string, string> = {
  SPY: "S&P 500",
  VOO: "S&P 500",
  IVV: "S&P 500",
  "360750.KS": "S&P 500",
  QQQ: "NASDAQ 100",
  "133690.KS": "NASDAQ 100",
  SMH: "반도체 주식 ETF",
  SOXX: "반도체 주식 ETF",
  SOXQ: "반도체 주식 ETF",
  "091160.KS": "반도체 주식 ETF",
  SCHD: "배당 주식 ETF",
  VIG: "배당 주식 ETF",
};
export function groupFor(point: MarketPoint) {
  return point.instrumentType === "etf"
    ? etfGroups[point.symbol]
      ? `etf:${etfGroups[point.symbol]}`
      : null
    : point.fundamentals?.industryKey || null;
}
export function historyRisk(point: MarketPoint) {
  const rows = [...(point.history ?? [])]
    .filter((row) => row.value > 0 && Number.isFinite(row.value))
    .sort((a, b) => compare(a.time, b.time));
  const unique = rows.filter(
    (row, index) =>
      !index || row.time.slice(0, 10) !== rows[index - 1].time.slice(0, 10),
  );
  if (unique.length < 200)
    return {
      count: unique.length,
      volatility: null,
      drawdown: null,
      priceChange: null,
    };
  const returns = unique
    .slice(1)
    .map((row, index) => row.value / unique[index].value - 1);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  let peak = unique[0].value,
    drawdown = 0;
  for (const row of unique) {
    peak = Math.max(peak, row.value);
    drawdown = Math.max(drawdown, 1 - row.value / peak);
  }
  return {
    count: unique.length,
    volatility: Math.sqrt(variance * 252),
    drawdown,
    priceChange: unique.at(-1)!.value / unique[0].value - 1,
  };
}

function unitsPerUsd(currency: string, points: MarketPoint[]): number | null {
  if (currency === "USD") return 1;
  const direct: Record<string, string> = {
    KRW: "KRW=X",
    TWD: "TWD=X",
    JPY: "JPY=X",
    CNY: "CNY=X",
    CHF: "CHF=X",
    CAD: "CAD=X",
    HKD: "HKD=X",
    SGD: "SGD=X",
    INR: "INR=X",
    THB: "THB=X",
    VND: "VND=X",
    MXN: "MXN=X",
  };
  const inverse: Record<string, string> = {
    EUR: "EURUSD=X",
    GBP: "GBPUSD=X",
    AUD: "AUDUSD=X",
    NZD: "NZDUSD=X",
  };
  const symbol = direct[currency] ?? inverse[currency];
  const fx = symbol
    ? points.find((point) => point.symbol === symbol)
    : undefined;
  if (!fx || fx.status !== "fresh" || fx.value === null || fx.value <= 0)
    return null;
  return inverse[currency] ? 1 / fx.value : fx.value;
}
export function annualValuation(point: MarketPoint, points: MarketPoint[]) {
  const latest = annualPeriods(point).at(-1),
    currency = point.fundamentals?.history?.currency;
  const cap = point.fundamentals?.marketCap,
    quoteCurrency = point.currency;
  if (
    !latest ||
    !currency ||
    !quoteCurrency ||
    cap === null ||
    cap === undefined ||
    cap <= 0
  )
    return { pe: null, pb: null, conversion: null };
  let amount = cap;
  if (currency !== quoteCurrency) {
    const from = unitsPerUsd(quoteCurrency, points),
      to = unitsPerUsd(currency, points);
    if (from === null || to === null)
      return { pe: null, pb: null, conversion: null };
    amount = (cap / from) * to;
  }
  return {
    pe:
      latest.netIncome !== null && latest.netIncome > 0
        ? amount / latest.netIncome
        : null,
    pb:
      latest.totalEquity !== null && latest.totalEquity > 0
        ? amount / latest.totalEquity
        : null,
    conversion:
      currency !== quoteCurrency
        ? `${point.symbol}: 시총 ${cap.toLocaleString("en-US")} ${quoteCurrency} × ${round(amount / cap, 6)} = ${round(amount).toLocaleString("en-US")} ${currency} (동일 수집본 환율)`
        : null,
  };
}

function peerMetric(
  point: MarketPoint,
  others: MarketPoint[],
  key: string,
  label: string,
  read: (item: MarketPoint) => number | null,
  unit: PeerMetric["unit"],
  lowerBetter: boolean,
): PeerMetric {
  const value = read(point);
  const members = others
    .flatMap((item) => {
      const number = read(item);
      return number === null
        ? []
        : [
            {
              symbol: item.symbol,
              name: item.label,
              value: number,
              periodEnd:
                item.instrumentType === "etf"
                  ? null
                  : (annualPeriods(item).at(-1)?.periodEnd ?? null),
            },
          ];
    })
    .sort((a, b) => compare(a.symbol, b.symbol));
  const percentile =
    value !== null && members.length >= 2
      ? round(
          (members.reduce(
            (sum, item) =>
              sum +
              (item.value === value
                ? 0.5
                : (lowerBetter ? item.value > value : item.value < value)
                  ? 1
                  : 0),
            0,
          ) /
            members.length) *
            100,
        )
      : null;
  return {
    key,
    label,
    value,
    median: median(members.map((item) => item.value)),
    percentile,
    sampleSize: members.length,
    unit,
    members,
  };
}

export function comparePeers(
  point: MarketPoint,
  points: MarketPoint[],
): PeerComparison {
  const group = groupFor(point),
    isEtf = point.instrumentType === "etf";
  const period = annualPeriods(point).at(-1)?.periodEnd;
  const others = group
    ? points
        .filter((item) => {
          if (
            item.symbol === point.symbol ||
            groupFor(item) !== group ||
            item.status !== "fresh" ||
            item.fundamentals?.status !== "fresh"
          )
            return false;
          if (isEtf) return item.instrumentType === "etf";
          const history = item.fundamentals.history,
            otherPeriod = annualPeriods(item).at(-1)?.periodEnd;
          return (
            item.instrumentType !== "etf" &&
            history?.status === "fresh" &&
            history.periods.length >= 3 &&
            period &&
            otherPeriod &&
            Math.abs(Date.parse(period) - Date.parse(otherPeriod)) <=
              200 * 86_400_000
          );
        })
        .sort((a, b) => compare(a.symbol, b.symbol))
    : [];
  const metrics = isEtf
    ? [
        peerMetric(
          point,
          others,
          "expenseRatio",
          "동일 유형 ETF 비용",
          (p) => finite(p.fundamentals?.expenseRatio),
          "percent",
          true,
        ),
        peerMetric(
          point,
          others,
          "drawdown",
          "동일 유형 ETF 최대 낙폭",
          (p) => historyRisk(p).drawdown,
          "percent",
          true,
        ),
      ]
    : [
        peerMetric(
          point,
          others,
          "annualPE",
          "최근 연간 이익 기준 P/E",
          (p) => annualValuation(p, points).pe,
          "ratio",
          true,
        ),
        peerMetric(
          point,
          others,
          "annualPB",
          "최근 연간 자본 기준 P/B",
          (p) => annualValuation(p, points).pb,
          "ratio",
          true,
        ),
        peerMetric(
          point,
          others,
          "cashMargin",
          "동종업계 연간 FCF/매출",
          (p) => deriveFinancials(p).latestCashMargin,
          "percent",
          false,
        ),
      ];
  return {
    groupKey: group,
    groupLabel: isEtf
      ? (group?.slice(4) ?? "동일 유형 미확인")
      : (point.fundamentals?.industry ?? "세부 업종 미확인"),
    source: isEtf
      ? "모형에 명시한 ETF 투자 유형"
      : "Yahoo Finance · 세부 업종 분류",
    count: others.length,
    symbols: others.map((p) => p.symbol),
    metrics,
    notes: [
      "비교 집단은 수집 목록 안의 기업·ETF이며 전체 산업을 대표하지 않습니다. 대상 자신은 중앙값과 순위에서 제외합니다.",
      ...(isEtf
        ? [
            "같은 유형 안에서도 지수 구성·상장 통화·환헤지·분배 정책이 다를 수 있습니다. 비용·변동성 점수는 추적오차를 평가하지 않습니다.",
          ]
        : [
            "동일 세부 업종·최신 연간 결산일 차이 200일 이내의 정상 자료만 비교합니다. 국가별 회계기준·시장 프리미엄 차이는 남아 있습니다.",
            "P/E·P/B는 현재 시가총액을 최근 연간 순이익·기말 자기자본으로 나눈 직접 계산값이며 TTM·예상 배수와 다릅니다. 거래·재무 통화가 다르면 같은 수집본의 정상 환율로 환산하며 환율이 없으면 배수 산출을 보류합니다.",
          ]),
      "지표마다 유효 비교 대상이 최소 2개 있어야 백분위를 산출합니다. 동점은 중간 순위를 부여합니다.",
      ...(!isEtf
        ? [point, ...others].flatMap((item) => {
            const value = annualValuation(item, points).conversion;
            return value ? [value] : [];
          })
        : []),
      ...(others.length < 2
        ? ["대상 외 비교 자료가 2개보다 적어 매매 후보 선정을 보류합니다."]
        : []),
    ],
  };
}

export function peerComponent(
  point: MarketPoint,
  peers: PeerComparison,
  financial = false,
): ScoreComponent {
  const weights = financial ? [15, 10, 0] : [10, 5, 5];
  const loss = deriveFinancials(point).last?.netIncome;
  const negativeEquity = deriveFinancials(point).last?.totalEquity;
  return component(
    "peers",
    financial ? "동종업계 평가" : "동종업계 가격·현금 비교",
    peers.metrics.flatMap((item, index) => {
      const weight = weights[index];
      if (!weight) return [];
      const knownBad =
        peers.count >= 2 &&
        ((item.key === "annualPE" &&
          loss !== null &&
          loss !== undefined &&
          loss <= 0) ||
          (item.key === "annualPB" &&
            negativeEquity !== null &&
            negativeEquity !== undefined &&
            negativeEquity <= 0));
      return [
        metric(
          item.key,
          item.label,
          item.value,
          item.unit,
          weight,
          knownBad
            ? 0
            : item.percentile === null
              ? null
              : round((item.percentile / 100) * weight),
          knownBad
            ? "확인된 적자·자본잠식은 낮은 배수를 저평가로 해석하지 않고 0점 처리합니다."
            : `본인을 뺀 유효 비교 ${item.sampleSize}개에 대한 유리한 방향의 백분위×${weight}점입니다. PER·PBR은 낮을수록, FCF 마진은 높을수록 유리합니다.`,
        ),
      ];
    }),
  );
}
