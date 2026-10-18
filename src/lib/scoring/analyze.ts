import { createHash } from "node:crypto";
import type { CollectionSnapshot } from "../domain/collection";
import type { MarketPoint } from "../domain/market";
import type {
  InstrumentScore,
  ScoreComponent,
  ScreeningAnalysis,
} from "../domain/scoring";
import {
  clamp,
  compare,
  component,
  corporateComponents,
  deriveFinancials,
  financialComponents,
  metric,
  round,
  scale,
} from "./financials";
import { comparePeers, historyRisk, peerComponent } from "./peers";
import { newsImpact, fitNewsContributions } from "./news";

export const MODEL_VERSION = "balanced-1.1.0";
const MIN_COVERAGE = 80,
  BUY = 70,
  SELL = 40,
  MIN_PEERS = 2;
const weights = [
  { key: "growth", label: "다년 성장", weight: 20 },
  { key: "quality", label: "수익성·지속성", weight: 20 },
  { key: "cash", label: "현금 창출", weight: 20 },
  { key: "stability", label: "재무 안정성", weight: 20 },
  { key: "peers", label: "동종업계 가격·현금 비교", weight: 20 },
];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function fingerprint(snapshot: CollectionSnapshot) {
  const points = snapshot.marketPoints
    .filter((point) => point.assetClass === "equity")
    .map((point) => ({
      symbol: point.symbol,
      label: point.label,
      region: point.region,
      sector: point.sector,
      kind: point.instrumentType,
      isWatchlist: point.isWatchlist,
      status: point.status,
      value: point.value,
      asOf: point.asOf,
      fundamentals: point.fundamentals
        ? {
            ...point.fundamentals,
            history: point.fundamentals.history
              ? {
                  ...point.fundamentals.history,
                  periods: [...point.fundamentals.history.periods].sort(
                    (a, b) => compare(a.periodEnd, b.periodEnd),
                  ),
                }
              : undefined,
          }
        : undefined,
      history: [...(point.history ?? [])].sort((a, b) =>
        compare(a.time, b.time),
      ),
    }))
    .sort((a, b) => compare(a.symbol, b.symbol));
  const news = [...snapshot.news].sort(
    (a, b) => compare(a.url, b.url) || compare(a.id, b.id),
  );
  const fx = snapshot.marketPoints
    .filter((point) => point.assetClass === "fx")
    .map((point) => ({
      symbol: point.symbol,
      value: point.value,
      status: point.status,
      asOf: point.asOf,
    }))
    .sort((a, b) => compare(a.symbol, b.symbol));
  return createHash("sha256")
    .update(
      stable({
        version: MODEL_VERSION,
        asOf: snapshot.collectedAt,
        mode: snapshot.mode,
        points,
        fx,
        news,
        newsStatus: snapshot.quality.newsStatus,
      }),
    )
    .digest("hex");
}
function coverage(components: ScoreComponent[]) {
  const all = components.flatMap((item) => item.metrics),
    max = all.reduce((sum, item) => sum + item.maxPoints, 0);
  const available = all.filter((item) => item.points !== null),
    known = available.reduce((sum, item) => sum + item.maxPoints, 0);
  const covered = round((known / max) * 100);
  return {
    coverage: covered,
    baseScore:
      covered >= MIN_COVERAGE && known > 0
        ? round(
            (available.reduce((sum, item) => sum + item.points!, 0) / known) *
              100,
          )
        : null,
  };
}
function etfComponents(
  point: MarketPoint,
  peer: ReturnType<typeof comparePeers>,
): ScoreComponent[] {
  const stats = historyRisk(point);
  return [
    component("cost", "ETF 비용", [
      metric(
        "expenseRatio",
        "연간 총비용 비율",
        point.fundamentals?.expenseRatio ?? null,
        "percent",
        30,
        scale(point.fundamentals?.expenseRatio ?? null, 0.003, 0.0003, 30),
        "연간 비용 0.03% 이하 30점, 0.30% 이상 0점. 추적오차·거래비용은 포함하지 않습니다.",
      ),
    ]),
    component("risk", "가격 위험", [
      metric(
        "volatility",
        "관측 일별 수익률 연율 변동성",
        stats.volatility,
        "percent",
        15,
        scale(stats.volatility, 0.45, 0.05, 15),
        "200개 이상 일별 가격의 표본 변동성×√252. 5% 이하 15점, 45% 이상 0점입니다.",
      ),
      metric(
        "drawdown",
        "관측 구간 최대 낙폭",
        stats.drawdown,
        "percent",
        15,
        scale(stats.drawdown, 0.5, 0.05, 15),
        "실제 가격 구간의 고점 대비 최대 하락률. 5% 이하 15점, 50% 이상 0점입니다.",
      ),
    ]),
    component("trend", "관측 가격 추세", [
      metric(
        "priceChange",
        "수집 구간 가격 변화",
        stats.priceChange,
        "percent",
        20,
        scale(stats.priceChange, -0.2, 0.2, 20),
        "관측 구간 -20~+20%를 0~20점으로 환산합니다. 미래 수익 예측이나 배당·환율 포함 총수익률이 아닙니다.",
      ),
    ]),
    component(
      "peers",
      "동일 유형 ETF 비교",
      peer.metrics.map((item) =>
        metric(
          item.key,
          item.label,
          item.value,
          item.unit,
          10,
          item.percentile === null ? null : round((item.percentile / 100) * 10),
          `본인을 제외한 유효 비교 ${item.sampleSize}개의 비용·낙폭 백분위×10점입니다.`,
        ),
      ),
    ),
  ];
}
function classify(
  point: MarketPoint,
  score: number | null,
  base: number | null,
  eligible: boolean,
  components: ScoreComponent[],
): { action: InstrumentScore["action"]; reasons: string[] } {
  if (!eligible || score === null || base === null)
    return {
      action: "watch",
      reasons: ["자료·비교 요건이 충족되지 않아 매수·축소 분류를 보류합니다."],
    };
  const reasons: string[] = [];
  if (point.instrumentType === "etf") {
    const risk = historyRisk(point);
    if (
      score >= BUY &&
      base >= 65 &&
      risk.volatility !== null &&
      risk.volatility <= 0.35 &&
      risk.drawdown !== null &&
      risk.drawdown <= 0.4
    )
      return {
        action: "buy",
        reasons: [
          "매수 점수 기준과 ETF 관측 변동성·낙폭 상한을 함께 충족했습니다.",
        ],
      };
    if (
      score <= SELL &&
      base <= 45 &&
      ((risk.priceChange ?? 0) < 0 || (risk.drawdown ?? 0) > 0.3)
    )
      return {
        action: "sell",
        reasons: [
          "축소 점수 기준과 ETF의 음의 가격 변화 또는 큰 낙폭을 함께 충족했습니다.",
        ],
      };
    if (risk.volatility !== null && risk.volatility > 0.35)
      reasons.push("ETF 관측 변동성이 매수 상한 35%를 넘습니다.");
    if (risk.drawdown !== null && risk.drawdown > 0.4)
      reasons.push("ETF 관측 최대 낙폭이 매수 상한 40%를 넘습니다.");
    reasons.push(
      score >= BUY
        ? "총점 외 추가 매수 조건을 충족하지 않았습니다."
        : score <= SELL
          ? "점수는 낮지만 가격 약화 조건을 함께 충족하지 않아 축소 판정을 보류합니다."
          : "총점이 매수·축소 문턱 사이에 있습니다.",
    );
    return { action: "watch", reasons };
  }
  const data = deriveFinancials(point),
    last = data.last;
  const pricePoints =
    components
      .find((item) => item.key === "peers")
      ?.metrics.filter((item) => ["annualPE", "annualPB"].includes(item.key))
      .reduce((sum, item) => sum + (item.points ?? 0), 0) ?? 0;
  if (
    score >= BUY &&
    base >= 65 &&
    last?.netIncome !== null &&
    last?.netIncome !== undefined &&
    last.netIncome > 0 &&
    last.freeCashFlow !== null &&
    last.freeCashFlow > 0 &&
    last.totalEquity !== null &&
    last.totalEquity > 0 &&
    data.rows
      .slice(-3)
      .filter((row) => row.netIncome !== null && row.netIncome > 0).length >=
      2 &&
    pricePoints >= 3
  )
    return {
      action: "buy",
      reasons: [
        "매수 점수, 최근 흑자·양의 FCF·자기자본, 최근3년 중2년 이상 흑자, 가격 비교 최소3점을 함께 충족했습니다.",
      ],
    };
  const weakness =
    (last?.netIncome !== null &&
      last?.netIncome !== undefined &&
      last.netIncome <= 0) ||
    (last?.freeCashFlow !== null &&
      last?.freeCashFlow !== undefined &&
      last.freeCashFlow <= 0) ||
    (last?.totalEquity !== null &&
      last?.totalEquity !== undefined &&
      last.totalEquity <= 0) ||
    (data.trend.revenueCagr !== null && data.trend.revenueCagr < 0) ||
    (data.latestDebt !== null && data.latestDebt > 2);
  if (score <= SELL && base <= 45 && weakness)
    return {
      action: "sell",
      reasons: [
        "축소 점수 기준과 적자·현금 유출·자본잠식·매출 감소·높은 부채 중 약화 근거를 함께 충족했습니다.",
      ],
    };
  if (
    last?.netIncome === null ||
    last?.netIncome === undefined ||
    last.netIncome <= 0
  )
    reasons.push(
      "최근 연간 순이익이 양수라는 매수 조건을 충족하지 않았습니다.",
    );
  if (
    last?.freeCashFlow === null ||
    last?.freeCashFlow === undefined ||
    last.freeCashFlow <= 0
  )
    reasons.push("최근 연간 FCF가 양수라는 매수 조건을 충족하지 않았습니다.");
  if (
    last?.totalEquity === null ||
    last?.totalEquity === undefined ||
    last.totalEquity <= 0
  )
    reasons.push("최근 자기자본이 양수라는 매수 조건을 충족하지 않았습니다.");
  if (pricePoints < 3)
    reasons.push(
      "연간 P/E·P/B의 동종 가격 점수가 최소3점보다 낮아 성장성만으로 매수하지 않습니다.",
    );
  if (
    data.rows
      .slice(-3)
      .filter((row) => row.netIncome !== null && row.netIncome > 0).length < 2
  )
    reasons.push(
      "최근3년 중2년 이상 흑자라는 매수 조건을 충족하지 않았습니다.",
    );
  if (score > SELL && score < BUY)
    reasons.push("총점이 매수·축소 문턱 사이에 있습니다.");
  else if (score <= SELL && !weakness)
    reasons.push(
      "점수는 낮지만 확인된 재무 약화가 함께 없어 축소 판정을 보류합니다.",
    );
  return {
    action: "watch",
    reasons: reasons.length
      ? reasons
      : ["총점 외 추가 매수 요건을 충족하지 않았습니다."],
  };
}

function analyzePoint(
  point: MarketPoint,
  points: MarketPoint[],
  snapshot: CollectionSnapshot,
): InstrumentScore {
  const etf = point.instrumentType === "etf";
  const financial =
    !etf &&
    /^(banks-|insurance-|reit-)|capital-markets|financial-conglomerates/.test(
      point.fundamentals?.industryKey ?? "",
    );
  const model = etf ? "etf" : financial ? "financial" : "corporate";
  const data = deriveFinancials(point),
    peers = comparePeers(point, snapshot.marketPoints),
    news = newsImpact(point, snapshot);
  const components = etf
    ? etfComponents(point, peers)
    : [
        ...(financial ? financialComponents(data) : corporateComponents(data)),
        peerComponent(point, peers, financial),
      ];
  const { coverage: known, baseScore } = coverage(components);
  const blockers: string[] = [];
  if (point.status !== "fresh" || point.value === null)
    blockers.push("현재 시세가 지연·누락 상태입니다.");
  if (point.fundamentals?.status !== "fresh")
    blockers.push("현재 재무·ETF 요약 자료가 부족하거나 오래되었습니다.");
  if (!etf) {
    if (data.rows.length < 3)
      blockers.push("연간 재무가 최소 3개 회계연도보다 적습니다.");
    if (!data.consecutive)
      blockers.push("연간 결산 자료가 연속된 기간이 아닙니다.");
    if (point.fundamentals?.history?.status !== "fresh" || !data.trend.currency)
      blockers.push("연간 재무의 기준일·통화·최신성을 확인할 수 없습니다.");
    if (
      data.rows
        .slice(-3)
        .some((row) => row.revenue === null || row.netIncome === null)
    )
      blockers.push("최근 연간 매출·이익 자료가 일부 누락되었습니다.");
    if (
      data.trend.lastPeriod &&
      Date.parse(snapshot.collectedAt) - Date.parse(data.trend.lastPeriod) >
        550 * 86_400_000
    )
      blockers.push("최근 연간 결산일이 550일보다 오래되었습니다.");
    if (financial)
      blockers.push(
        "금융·보험·리츠는 규제자본·지급여력·FFO 등 업종 핵심 지표가 없어 자동 매매 판정을 보류합니다.",
      );
  } else if (historyRisk(point).count < 200)
    blockers.push("ETF 가격 위험을 계산할 일별 관측값이 200개보다 적습니다.");
  if (peers.count < MIN_PEERS)
    blockers.push(
      "동일 세부 업종·유형의 유효 비교 대상이 본인 외 2개보다 적습니다.",
    );
  const peerFactor = components.find((item) => item.key === "peers");
  if (!peerFactor || peerFactor.coverage < 50)
    blockers.push("동종 비교 지표의 절반 이상을 확보하지 못했습니다.");
  if (known < MIN_COVERAGE)
    blockers.push(`점수 자료 충족률이 ${MIN_COVERAGE}%보다 낮습니다.`);
  const eligible = blockers.length === 0;
  const totalScore =
    baseScore === null
      ? null
      : round(clamp(baseScore + news.adjustment, 0, 100));
  if (
    baseScore !== null &&
    totalScore !== null &&
    round(totalScore - baseScore) !== news.adjustment
  ) {
    const requested = news.adjustment,
      applied = round(totalScore - baseScore);
    if (requested) fitNewsContributions(news.items, applied);
    news.adjustment = applied;
    news.notes.push(
      "총점의 0~100 범위에 맞춰 뉴스의 실제 반영 점수를 제한했습니다.",
    );
  }
  if (baseScore === null) {
    for (const item of news.items) item.contribution = 0;
    news.adjustment = 0;
    news.notes.push(
      "기본 점수를 산출할 자료가 부족하여 기사 연결만 표시하고 점수 가감은 보류합니다.",
    );
  }
  const before = classify(point, baseScore, baseScore, eligible, components),
    decision = classify(point, totalScore, baseScore, eligible, components);
  news.beforeAction = before.action;
  news.changedAction = decision.action !== before.action;
  return {
    symbol: point.symbol,
    name: point.label,
    kind: etf ? "etf" : "stock",
    model,
    baseScore,
    totalScore,
    coverage: known,
    eligible,
    action: decision.action,
    actionReasons: decision.reasons,
    rank: null,
    components,
    trend: data.trend,
    peers,
    news,
    blockers,
    warnings: [
      ...(known < 100
        ? [
            "확보한 지표의 가중치만으로 100점 환산한 부분 자료 점수입니다. 누락 지표를 0점으로 넣지 않았습니다.",
          ]
        : []),
      ...(etf
        ? [
            "ETF 점수는 기업 재무 점수와 다른 모형입니다. 가격 위험은 거래 통화 기준이며 환율·배당을 포함하지 않습니다.",
          ]
        : [
            "연간 자료는 현재 공급자 이력입니다. 공시 당시 이용 가능했던 수치나 재작성 전 자료를 보장하지 않아 과거 시점 백테스트에 그대로 사용할 수 없습니다.",
          ]),
      ...(point.currency !== data.trend.currency && !etf
        ? [
            "거래 통화와 재무 통화가 다를 수 있습니다. 원시 현금액을 주식 시가총액으로 나눈 수익률을 계산하지 않습니다.",
          ]
        : []),
    ],
  };
}

export function analyzeSnapshot(
  snapshot: CollectionSnapshot,
): ScreeningAnalysis {
  const points = snapshot.marketPoints
    .filter((point) => point.assetClass === "equity")
    .sort((a, b) => compare(a.symbol, b.symbol));
  const scores = points.map((point) => analyzePoint(point, points, snapshot));
  for (const model of ["corporate", "financial", "etf"] as const) {
    const ranked = scores
      .filter((item) => item.model === model && item.totalScore !== null)
      .sort(
        (a, b) => b.totalScore! - a.totalScore! || compare(a.symbol, b.symbol),
      );
    ranked.forEach((score, index) => {
      score.rank = index + 1;
    });
  }
  const selected: ScreeningAnalysis["selected"] = [];
  for (const action of ["buy", "sell", "watch"] as const) {
    const ranked = scores
      .filter((score) => score.action === action)
      .sort((a, b) => {
        if (action === "watch") {
          const aWatch = points.find((point) => point.symbol === a.symbol)
              ?.isWatchlist
              ? 1
              : 0,
            bWatch = points.find((point) => point.symbol === b.symbol)
              ?.isWatchlist
              ? 1
              : 0;
          if (aWatch !== bWatch) return bWatch - aWatch;
        }
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (a.model !== b.model) return compare(a.model, b.model);
        if (a.totalScore === null && b.totalScore !== null) return 1;
        if (a.totalScore !== null && b.totalScore === null) return -1;
        return (
          (action === "sell"
            ? (a.totalScore ?? 0) - (b.totalScore ?? 0)
            : (b.totalScore ?? 0) - (a.totalScore ?? 0)) ||
          compare(a.symbol, b.symbol)
        );
      });
    const shown: InstrumentScore[] = [];
    if (action !== "watch") {
      // Fixed display slots provide regional/model representation, not portfolio allocations.
      for (const [model, region] of [
        ["corporate", "US"],
        ["corporate", "US"],
        ["corporate", "KR"],
        ["etf", null],
      ] as const) {
        const next = ranked.find(
          (score) =>
            score.model === model &&
            (!region ||
              points.find((point) => point.symbol === score.symbol)?.region ===
                region) &&
            !shown.includes(score),
        );
        if (next) shown.push(next);
      }
    }
    for (const score of ranked)
      if (shown.length < 4 && !shown.includes(score)) shown.push(score);
    selected.push(
      ...shown.map((score) => ({ symbol: score.symbol, action: score.action })),
    );
  }
  return {
    modelVersion: MODEL_VERSION,
    profile: "balanced",
    inputHash: fingerprint(snapshot),
    asOf: snapshot.collectedAt,
    weights,
    buyThreshold: BUY,
    sellThreshold: SELL,
    newsLimit: 5,
    minAnnualPeriods: 3,
    minPeers: MIN_PEERS,
    minCoverage: MIN_COVERAGE,
    scores,
    selected,
    notes: [
      "동일 수집 자료와 모형 버전이면 점수·분류·후보·동점 순서가 같습니다. Codex는 이를 변경하지 않습니다.",
      "일반 기업은 성장20·수익성20·현금20·안정성20·동종비교20점, 뉴스 순조정 ±5점입니다. 금융기관과 ETF는 각 상세에 표시한 별도 가중치를 사용하며 서로의 순위를 합치지 않습니다.",
      "매수는 총점70 이상·기본65 이상 및 양의 최근 이익·FCF·자기자본, 최근3년 중2년 이상 흑자, 연간 P/E·P/B 가격 비교 최소3점을 요구합니다. ETF는 변동성35%·최대낙폭40% 이내를 추가로 요구합니다.",
      "축소는 총점40 이하·기본45 이하와 적자·현금유출·자본잠식·매출감소·높은 부채 등 약화 근거를 함께 요구합니다. 보유 여부는 입력되지 않았습니다.",
      "오버뷰는 매수·축소·관찰 각각 최대4개의 대표 후보를 표시합니다. 매수·축소는 미국 기업2·한국 기업1·ETF1의 표시 자리를 우선 배정하고 빈 자리는 같은 분류로 채웁니다. 이는 자산 배분 권고가 아니며 서로 다른 모형의 점수를 합쳐 순위를 매기지 않습니다. 관찰은 관심 종목을 먼저 표시합니다. 전체 분류는 종목 평가에서 확인할 수 있습니다.",
      "점수는 이 프로젝트의 공개 규칙에 따른 비교 지표이며 상승 확률·목표 수익률·검증된 초과성과가 아닙니다. 가중치와 구간은 백테스트로 최적화하지 않았습니다.",
    ],
  };
}
