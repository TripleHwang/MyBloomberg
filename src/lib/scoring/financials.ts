import type { MarketPoint } from "../domain/market";
import type {
  AnnualFinancialPeriod,
  FinancialTrendSummary,
  ScoringMetric,
  ScoreComponent,
} from "../domain/scoring";

export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const round = (value: number, precision = 2) =>
  Number(value.toFixed(precision));
export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
export const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export const ratio = (
  a: number | null | undefined,
  b: number | null | undefined,
) =>
  a !== null && a !== undefined && b !== null && b !== undefined && b > 0
    ? finite(a / b)
    : null;
export function median(values: Array<number | null | undefined>) {
  const sorted = values
    .filter((value): value is number => finite(value) !== null)
    .sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[half]
      : (sorted[half - 1] + sorted[half]) / 2
    : null;
}
export function scale(
  value: number | null,
  low: number,
  high: number,
  weight: number,
) {
  return value === null
    ? null
    : round(clamp((value - low) / (high - low)) * weight);
}
export function metric(
  key: string,
  label: string,
  value: number | null,
  unit: ScoringMetric["unit"],
  maxPoints: number,
  points: number | null,
  explanation: string,
): ScoringMetric {
  return { key, label, value, unit, maxPoints, points, explanation };
}
export function component(
  key: string,
  label: string,
  metrics: ScoringMetric[],
): ScoreComponent {
  const weight = metrics.reduce((sum, item) => sum + item.maxPoints, 0);
  const available = metrics.filter((item) => item.points !== null);
  return {
    key,
    label,
    weight,
    points: available.length
      ? round(available.reduce((sum, item) => sum + item.points!, 0))
      : null,
    coverage: round(
      (available.reduce((sum, item) => sum + item.maxPoints, 0) / weight) * 100,
    ),
    metrics,
  };
}
export function annualPeriods(point: MarketPoint): AnnualFinancialPeriod[] {
  return [...(point.fundamentals?.history?.periods ?? [])]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.periodEnd))
    .sort((a, b) => compare(a.periodEnd, b.periodEnd))
    .slice(-5);
}
function cagr(rows: AnnualFinancialPeriod[], key: "revenue" | "netIncome") {
  const first = rows[0],
    last = rows.at(-1);
  if (
    !first ||
    !last ||
    rows.length < 3 ||
    rows.some((row) => row[key] === null || row[key]! <= 0)
  )
    return null;
  const years =
    (Date.parse(last.periodEnd) - Date.parse(first.periodEnd)) /
    (365.25 * 86_400_000);
  return years > 0
    ? finite((last[key]! / first[key]!) ** (1 / years) - 1)
    : null;
}
export function deriveFinancials(point: MarketPoint) {
  const rows = annualPeriods(point);
  const first = rows[0],
    last = rows.at(-1);
  const margins = rows.map((row) => ratio(row.netIncome, row.revenue));
  const cashMargins = rows.map((row) => ratio(row.freeCashFlow, row.revenue));
  const roes = rows.slice(1).map((row, index) => {
    const prior = rows[index].totalEquity;
    return prior !== null &&
      prior > 0 &&
      row.totalEquity !== null &&
      row.totalEquity > 0
      ? ratio(row.netIncome, (prior + row.totalEquity) / 2)
      : null;
  });
  const debtRatio = (row?: AnnualFinancialPeriod) =>
    row && row.totalDebt !== null && row.totalDebt >= 0
      ? ratio(row.totalDebt, row.totalEquity)
      : null;
  const latestDebt = debtRatio(last),
    firstDebt = debtRatio(first);
  const firstMargin = margins[0],
    lastMargin = margins.at(-1) ?? null;
  const knownIncome = rows.filter((row) => row.netIncome !== null);
  const knownCash = rows.filter((row) => row.freeCashFlow !== null);
  const knownEquity = rows.filter((row) => row.totalEquity !== null);
  const consecutive = rows.every(
    (row, index) =>
      !index ||
      (() => {
        const gap =
          (Date.parse(row.periodEnd) - Date.parse(rows[index - 1].periodEnd)) /
          86_400_000;
        return gap >= 300 && gap <= 430;
      })(),
  );
  const trend: FinancialTrendSummary = {
    years: rows.length,
    firstPeriod: first?.periodEnd ?? null,
    lastPeriod: last?.periodEnd ?? null,
    currency: point.fundamentals?.history?.currency ?? null,
    revenueCagr: cagr(rows, "revenue"),
    earningsCagr: cagr(rows, "netIncome"),
    positiveIncomeYears: knownIncome.filter((row) => row.netIncome! > 0).length,
    positiveFcfYears: knownCash.filter((row) => row.freeCashFlow! > 0).length,
    notes: [
      ...(point.fundamentals?.history?.notes ?? []),
      ...(!consecutive
        ? [
            "연간 결산 간격이 300~430일 범위를 벗어나 연속된 실적으로 평가할 수 없습니다.",
          ]
        : []),
      ...(rows.some((row) => row.netIncome !== null && row.netIncome <= 0)
        ? [
            "적자·0이익 연도를 포함해 이익 CAGR을 산출하지 않습니다. 흑자 전환을 임의의 성장률로 바꾸지 않습니다.",
          ]
        : []),
    ],
  };
  return {
    rows,
    last,
    trend,
    consecutive,
    medianMargin: median(margins),
    medianRoe: median(roes),
    marginChange:
      firstMargin !== null && firstMargin !== undefined && lastMargin !== null
        ? lastMargin - firstMargin
        : null,
    medianCashMargin: median(cashMargins),
    latestCashMargin: cashMargins.at(-1) ?? null,
    latestDebt,
    debtChange:
      latestDebt !== null && firstDebt !== null ? latestDebt - firstDebt : null,
    incomeRatio:
      knownIncome.length === rows.length && rows.length >= 3
        ? trend.positiveIncomeYears / rows.length
        : null,
    cashRatio:
      knownCash.length === rows.length && rows.length >= 3
        ? trend.positiveFcfYears / rows.length
        : null,
    equityRatio:
      knownEquity.length === rows.length && rows.length >= 3
        ? knownEquity.filter((row) => row.totalEquity! > 0).length / rows.length
        : null,
  };
}

export function corporateComponents(
  data: ReturnType<typeof deriveFinancials>,
): ScoreComponent[] {
  const t = data.trend;
  const negativeEquity =
    data.last?.totalEquity !== null &&
    data.last?.totalEquity !== undefined &&
    data.last.totalEquity <= 0;
  return [
    component("growth", "다년 성장", [
      metric(
        "revenueCagr",
        "매출 연평균 성장률",
        t.revenueCagr,
        "percent",
        12,
        scale(t.revenueCagr, -0.1, 0.2, 12),
        "확보한 3~5개 연속 회계연도 매출 CAGR. -10% 이하 0점, 20% 이상 12점, 사이는 선형입니다.",
      ),
      metric(
        "earningsCagr",
        "이익 연평균 성장률",
        t.earningsCagr,
        "percent",
        8,
        scale(t.earningsCagr, -0.1, 0.2, 8),
        "모든 연도가 양의 이익일 때만 CAGR을 계산합니다. -10%~20%를 0~8점으로 환산합니다.",
      ),
    ]),
    component("quality", "수익성·지속성", [
      metric(
        "medianMargin",
        "연간 순이익률 중앙값",
        data.medianMargin,
        "percent",
        8,
        scale(data.medianMargin, 0, 0.2, 8),
        "연간 순이익/매출의 중앙값. 0~20%를 0~8점으로 환산합니다.",
      ),
      metric(
        "medianRoe",
        "평균자본 기준 ROE 중앙값",
        data.medianRoe,
        "percent",
        6,
        scale(data.medianRoe, 0, 0.25, 6),
        "당기 순이익/기초·기말 평균 자기자본. 자기자본이 양수인 연도만 사용하며 0~25%를 0~6점으로 환산합니다.",
      ),
      metric(
        "marginChange",
        "처음 대비 최근 순이익률 변화",
        data.marginChange,
        "percent",
        6,
        scale(data.marginChange, -0.05, 0.05, 6),
        "첫 회계연도 대비 최근 순이익률 변화 -5~+5%p를 0~6점으로 환산합니다.",
      ),
    ]),
    component("cash", "현금 창출", [
      metric(
        "cashPositive",
        "양의 FCF 연도 비율",
        data.cashRatio,
        "percent",
        10,
        data.cashRatio === null ? null : round(data.cashRatio * 10),
        "모든 연도의 FCF가 있을 때 양의 FCF 연도 비율×10입니다.",
      ),
      metric(
        "cashMargin",
        "FCF/매출 중앙값",
        data.medianCashMargin,
        "percent",
        10,
        scale(data.medianCashMargin, 0, 0.15, 10),
        "연간 FCF/매출 중앙값 0~15%를 0~10점으로 환산합니다.",
      ),
    ]),
    component("stability", "재무 안정성", [
      metric(
        "debtEquity",
        "최근 연간 부채/자본",
        data.latestDebt,
        "ratio",
        10,
        negativeEquity ? 0 : scale(data.latestDebt, 2, 0.3, 10),
        "총이자부채/자기자본. 0.3배 이하 10점, 2배 이상 0점. 확인된 자본잠식은 0점입니다.",
      ),
      metric(
        "debtChange",
        "부채/자본 비율 변화",
        data.debtChange,
        "ratio",
        5,
        scale(data.debtChange, 0.3, -0.3, 5),
        "처음 대비 최근 비율 변화. 0.3배 하락 5점, 0.3배 상승 0점입니다.",
      ),
      metric(
        "equityPositive",
        "양의 자기자본 연도 비율",
        data.equityRatio,
        "percent",
        5,
        data.equityRatio === null ? null : round(data.equityRatio * 5),
        "모든 연도 자기자본이 확인될 때 양의 자기자본 연도 비율×5입니다.",
      ),
    ]),
  ];
}

export function financialComponents(
  data: ReturnType<typeof deriveFinancials>,
): ScoreComponent[] {
  const equityAssets = ratio(data.last?.totalEquity, data.last?.totalAssets);
  return [
    component("growth", "다년 성장", [
      metric(
        "revenueCagr",
        "매출 CAGR",
        data.trend.revenueCagr,
        "percent",
        12,
        scale(data.trend.revenueCagr, -0.1, 0.2, 12),
        "-10~20%를 0~12점으로 환산합니다.",
      ),
      metric(
        "earningsCagr",
        "이익 CAGR",
        data.trend.earningsCagr,
        "percent",
        13,
        scale(data.trend.earningsCagr, -0.1, 0.2, 13),
        "적자 포함 시 산출 보류. -10~20%를 0~13점으로 환산합니다.",
      ),
    ]),
    component("quality", "수익성", [
      metric(
        "medianRoe",
        "평균자본 기준 ROE 중앙값",
        data.medianRoe,
        "percent",
        15,
        scale(data.medianRoe, 0, 0.2, 15),
        "0~20%를 0~15점으로 환산합니다.",
      ),
      metric(
        "marginChange",
        "순이익률 변화",
        data.marginChange,
        "percent",
        10,
        scale(data.marginChange, -0.05, 0.05, 10),
        "-5~+5%p를 0~10점으로 환산합니다.",
      ),
    ]),
    component("balance", "장부 자료", [
      metric(
        "incomePositive",
        "흑자 연도 비율",
        data.incomeRatio,
        "percent",
        12.5,
        data.incomeRatio === null ? null : round(data.incomeRatio * 12.5),
        "모든 연도 순이익이 있을 때 흑자 연도 비율을 평가합니다.",
      ),
      metric(
        "equityAssets",
        "장부 자기자본/자산",
        equityAssets,
        "percent",
        12.5,
        scale(equityAssets, 0.03, 0.12, 12.5),
        "단순 장부 비율이며 CET1·지급여력·보험준비금 지표가 아닙니다. 이 자료만으로 금융기관 매매 후보를 선정하지 않습니다.",
      ),
    ]),
  ];
}
