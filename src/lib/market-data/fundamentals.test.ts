import { describe, expect, it } from "vitest";
import type { Quote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { InstrumentDefinition } from "../domain/collection";
import { normalizeFundamentals } from "./fundamentals";
import { buildBriefingInput } from "../report/input";
import { fixtureSnapshot } from "../collection/fixtures";

const now = new Date("2026-10-18T07:00:00Z");
const instrument: InstrumentDefinition = {
  id: "asset-MSFT",
  symbol: "MSFT",
  label: "Microsoft",
  assetClass: "equity",
  currency: "USD",
  region: "US",
  provider: "yahoo",
  instrumentType: "stock",
};
const quote = { currency: "USD", dividendYield: 1.5 } as Quote;
const summary = {
  financialData: {
    revenueGrowth: 0.1,
    debtToEquity: 29.12,
    financialCurrency: "USD",
  },
  defaultKeyStatistics: { mostRecentQuarter: new Date("2026-06-30T00:00:00Z") },
  summaryDetail: { dividendYield: 0.02 },
} as QuoteSummaryResult;

describe("fundamental metric normalization", () => {
  it("keeps current valuation collection dates separate from financial reporting dates", () => {
    const snapshot = fixtureSnapshot(
      "2026-10-18_160000000_aaaaaaaa",
      [instrument],
      now,
    );
    snapshot.marketPoints[0].fundamentals = normalizeFundamentals(
      { ...quote, trailingPE: 30 } as Quote,
      summary,
      instrument,
      now,
    );
    const { evidence } = buildBriefingInput(snapshot);
    expect(
      evidence.find((item) => item.id === "fund:asset-MSFT:trailingPE")?.asOf,
    ).toBe(now.toISOString());
    expect(
      evidence.find((item) => item.id === "fund:asset-MSFT:revenueGrowth")
        ?.asOf,
    ).toBe("2026-06-30");
  });
  it("keeps fraction and percentage units distinct and prefers summary dividend yield", () => {
    const result = normalizeFundamentals(quote, summary, instrument, now);
    expect(result).toMatchObject({
      status: "fresh",
      revenueGrowth: 0.1,
      debtToEquity: 29.12,
      dividendYield: 0.02,
      periodEnd: "2026-06-30",
      trailingPE: null,
    });
    expect(
      normalizeFundamentals(quote, null, instrument, now).dividendYield,
    ).toBe(0.015);
  });
  it("requires a financial reporting period for stocks and expense data for ETFs", () => {
    expect(normalizeFundamentals(quote, null, instrument, now).status).toBe(
      "missing",
    );
    expect(
      normalizeFundamentals(
        quote,
        summary,
        { ...instrument, instrumentType: "etf" },
        now,
      ).status,
    ).toBe("missing");
    const etf = {
      fundProfile: { feesExpensesInvestment: { annualReportExpenseRatio: 0 } },
    } as QuoteSummaryResult;
    expect(
      normalizeFundamentals(
        quote,
        etf,
        { ...instrument, instrumentType: "etf" },
        now,
      ),
    ).toMatchObject({ status: "fresh", expenseRatio: 0 });
    expect(
      normalizeFundamentals(quote, summary, instrument, new Date("2027-06-30"))
        .status,
    ).toBe("stale");
  });
});
