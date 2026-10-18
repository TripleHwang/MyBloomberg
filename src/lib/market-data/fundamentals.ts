import type { Quote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { FundamentalMetrics } from "../domain/briefing";
import type { InstrumentDefinition } from "../domain/collection";
import { finiteNumber } from "./normalize";

export function normalizeFundamentals(
  quote: Quote,
  summary: QuoteSummaryResult | null,
  instrument: InstrumentDefinition,
  now: Date,
): FundamentalMetrics {
  const financial = summary?.financialData;
  const statistics = summary?.defaultKeyStatistics;
  const detail = summary?.summaryDetail;
  const period = statistics?.mostRecentQuarter;
  const periodEnd =
    period instanceof Date && Number.isFinite(period.getTime())
      ? period.toISOString().slice(0, 10)
      : null;
  const periodAge = periodEnd
    ? now.getTime() - Date.parse(periodEnd)
    : Infinity;
  const expenseRatio = finiteNumber(
    summary?.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio ??
      statistics?.annualReportExpenseRatio,
  );
  const usable =
    instrument.instrumentType === "etf"
      ? expenseRatio !== null
      : Boolean(financial && periodEnd);
  const status = !usable
    ? "missing"
    : instrument.instrumentType === "etf" ||
        (periodAge >= -86_400_000 && periodAge < 210 * 86_400_000)
      ? "fresh"
      : "stale";
  const rawQuoteYield =
    "dividendYield" in quote ? finiteNumber(quote.dividendYield) : null;
  return {
    status,
    fetchedAt: now.toISOString(),
    periodEnd,
    source: "Yahoo Finance",
    industry: summary?.assetProfile?.industry ?? null,
    industryKey: summary?.assetProfile?.industryKey ?? null,
    financialCurrency:
      financial?.financialCurrency ??
      statistics?.financialCurrency ??
      quote.currency ??
      instrument.currency,
    trailingPE: finiteNumber(quote.trailingPE ?? detail?.trailingPE),
    forwardPE: finiteNumber(quote.forwardPE ?? detail?.forwardPE),
    priceToBook: finiteNumber(quote.priceToBook ?? statistics?.priceToBook),
    marketCap: finiteNumber(quote.marketCap ?? detail?.marketCap),
    revenueGrowth: finiteNumber(financial?.revenueGrowth),
    earningsGrowth: finiteNumber(financial?.earningsGrowth),
    profitMargins: finiteNumber(
      financial?.profitMargins ?? statistics?.profitMargins,
    ),
    returnOnEquity: finiteNumber(financial?.returnOnEquity),
    debtToEquity: finiteNumber(financial?.debtToEquity),
    freeCashflow: finiteNumber(financial?.freeCashflow),
    dividendYield: finiteNumber(
      detail?.dividendYield ??
        (rawQuoteYield === null ? null : rawQuoteYield / 100),
    ),
    expenseRatio,
    fiftyTwoWeekHigh: finiteNumber(
      quote.fiftyTwoWeekHigh ?? detail?.fiftyTwoWeekHigh,
    ),
    fiftyTwoWeekLow: finiteNumber(
      quote.fiftyTwoWeekLow ?? detail?.fiftyTwoWeekLow,
    ),
    note:
      status === "missing"
        ? "일부 시세 지표만 있습니다. 실적 기준일 또는 ETF 비용 자료가 없어 중장기 후보 판정을 제한합니다."
        : status === "stale"
          ? "실적 기준일이 오래되었거나 확인이 필요합니다. 현재 실적으로 단정하지 않습니다."
          : instrument.instrumentType === "etf"
            ? "ETF 비용은 연간 비율이며 수집일 기준 공급자 자료입니다. 실제 추적 지수·보수는 원문에서 확인하세요."
            : "표시된 재무 날짜는 공급자의 최신 분기 기준일입니다. 지표별 집계 기간은 TTM·분기 등으로 다를 수 있습니다. 예상 PER은 공급자 추정이며 확정 실적과 구분합니다.",
  };
}
