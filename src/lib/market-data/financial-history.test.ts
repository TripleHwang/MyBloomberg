import { describe, expect, it } from "vitest";
import type { FundamentalsTimeSeriesResult } from "yahoo-finance2/modules/fundamentalsTimeSeries";
import { normalizeFinancialHistory } from "./financial-history";

const now = new Date("2026-10-18T07:00:00Z");
const rows = (values: unknown[]) => values as FundamentalsTimeSeriesResult[];
describe("annual statement normalization", () => {
  it("filters empty, quarterly and future rows and preserves missing versus true zero values", () => {
    const result = normalizeFinancialHistory(
      rows([
        {
          date: new Date("2022-12-31"),
          periodType: "12M",
          totalRevenue: 100,
          netIncome: 10,
          totalDebt: 0,
        },
        {
          date: new Date("2023-12-31"),
          periodType: "12M",
          totalRevenue: 110,
          netIncome: 11,
          operatingCashFlow: 20,
          capitalExpenditure: -5,
        },
        {
          date: new Date("2024-12-31"),
          periodType: "12M",
          totalRevenue: 120,
          netIncome: 12,
        },
        { date: new Date("2025-03-31"), periodType: "3M", totalRevenue: 999 },
        { date: new Date("2026-12-31"), periodType: "12M", totalRevenue: 999 },
        { date: new Date("2021-12-31"), periodType: "12M" },
      ]),
      "USD",
      now,
    );
    expect(result.status).toBe("stale");
    expect(result.periods).toHaveLength(3);
    expect(result.periods[0].totalDebt).toBe(0);
    expect(result.periods[0].totalEquity).toBeNull();
    expect(result.periods[1].freeCashFlow).toBe(15);
    expect(result.notes.join(" ")).toContain("영업현금흐름");
  });
  it("resolves duplicate dates deterministically and requires reporting currency", () => {
    const input = rows([
      { date: new Date("2025-12-31"), periodType: "12M", totalRevenue: 120 },
      {
        date: new Date("2025-12-31"),
        periodType: "12M",
        totalRevenue: 120,
        netIncome: 12,
      },
    ]);
    expect(normalizeFinancialHistory(input, "USD", now)).toEqual(
      normalizeFinancialHistory([...input].reverse(), "USD", now),
    );
    expect(normalizeFinancialHistory(input, null, now).status).toBe("missing");
    expect(
      normalizeFinancialHistory(input, "USD", now).periods[0].netIncome,
    ).toBe(12);
  });
});
