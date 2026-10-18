import type { FundamentalsTimeSeriesResult } from "yahoo-finance2/modules/fundamentalsTimeSeries";
import type {
  AnnualFinancialPeriod,
  FinancialHistory,
} from "../domain/scoring";
import { finiteNumber } from "./normalize";

const mapping = {
  revenue: "totalRevenue",
  netIncome: "netIncome",
  operatingCashFlow: "operatingCashFlow",
  capitalExpenditure: "capitalExpenditure",
  freeCashFlow: "freeCashFlow",
  totalDebt: "totalDebt",
  totalEquity: "stockholdersEquity",
  totalAssets: "totalAssets",
} as const;

export function normalizeFinancialHistory(
  rows: FundamentalsTimeSeriesResult[],
  currency: string | null,
  now: Date,
): FinancialHistory {
  const periods = new Map<string, AnnualFinancialPeriod>();
  let derived = false;
  for (const row of rows) {
    if (
      row.periodType !== "12M" ||
      !(row.date instanceof Date) ||
      !Number.isFinite(row.date.getTime()) ||
      row.date.getTime() > now.getTime()
    )
      continue;
    const periodEnd = row.date.toISOString().slice(0, 10);
    const values = row as unknown as Record<string, unknown>;
    const normalized = { periodEnd } as AnnualFinancialPeriod;
    for (const [target, source] of Object.entries(mapping))
      normalized[target as keyof typeof mapping] = finiteNumber(values[source]);
    if (
      Object.values(mapping).every((key) => finiteNumber(values[key]) === null)
    )
      continue;
    if (
      normalized.freeCashFlow === null &&
      normalized.operatingCashFlow !== null &&
      normalized.capitalExpenditure !== null
    ) {
      normalized.freeCashFlow =
        normalized.operatingCashFlow - Math.abs(normalized.capitalExpenditure);
      derived = true;
    }
    const previous = periods.get(periodEnd);
    // Duplicate conflicting rows are resolved by coverage and canonical values, never provider ordering.
    const completeness = (item: AnnualFinancialPeriod) =>
      Object.values(item).filter((value) => typeof value === "number").length;
    if (
      !previous ||
      completeness(normalized) > completeness(previous) ||
      (completeness(normalized) === completeness(previous) &&
        JSON.stringify(normalized) < JSON.stringify(previous))
    )
      periods.set(periodEnd, normalized);
  }
  const annual = [...periods.values()]
    .sort((a, b) =>
      a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0,
    )
    .slice(-5);
  const latest = annual.at(-1);
  const stale =
    latest && now.getTime() - Date.parse(latest.periodEnd) > 550 * 86_400_000;
  return {
    status:
      annual.length < 3 || !currency ? "missing" : stale ? "stale" : "fresh",
    fetchedAt: now.toISOString(),
    source: "Yahoo Finance · 연간 재무제표",
    currency,
    periods: annual,
    notes: [
      "12개월 연간 결산 자료만 사용합니다. 분기·TTM 자료와 섞지 않습니다.",
      "재무 통화는 공급자의 현재 보고 통화입니다. 회계기준·통화 변경 및 재작성 이력과 실제 공시 발표일은 별도로 검증하지 않았습니다.",
      ...(annual.length < 3
        ? ["확보한 연간 재무가 3개 회계연도보다 적습니다."]
        : []),
      ...(stale
        ? ["최신 연간 결산일이 수집일보다 550일 넘게 오래되었습니다."]
        : []),
      ...(derived
        ? [
            "공급자 FCF가 없는 일부 연도는 영업현금흐름에서 설비투자 절댓값을 차감해 계산했습니다.",
          ]
        : []),
    ],
  };
}
