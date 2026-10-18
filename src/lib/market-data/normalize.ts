import type { InstrumentDefinition } from "../domain/collection";
import type { MarketPoint } from "../domain/market";
import { assessFreshness } from "./freshness";

export const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function makePoint(
  instrument: InstrumentDefinition,
  input: {
    value: number | null;
    change?: number | null;
    changePercent?: number | null;
    asOf: string | null;
    source: string;
    history?: MarketPoint["history"];
  },
  now = new Date(),
): MarketPoint {
  const value = finiteNumber(input.value);
  const change = finiteNumber(input.change);
  const percent = finiteNumber(input.changePercent);
  const assessment = assessFreshness(instrument, input.asOf, value, now);
  const rate = instrument.assetClass === "rate";
  const decimals = rate
    ? 3
    : instrument.currency === "KRW" && instrument.assetClass === "equity"
      ? 0
      : instrument.assetClass === "fx" && value !== null && Math.abs(value) < 10
        ? 4
        : 2;
  const displayValue =
    value === null
      ? "—"
      : `${instrument.currency === "USD" && !["index", "fx"].includes(instrument.assetClass) ? "$" : ""}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${rate ? "%" : ""}`;
  const move = rate ? (change === null ? null : change * 100) : percent;
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    label: instrument.label,
    assetClass: instrument.assetClass,
    region: instrument.region,
    instrumentType: instrument.instrumentType,
    sector: instrument.sector,
    isWatchlist: Boolean(instrument.isWatchlist),
    value,
    displayValue,
    change,
    changePercent: percent,
    displayChange:
      move === null
        ? "—"
        : `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move).toFixed(rate ? 1 : 2)}${rate ? " bp" : "%"}`,
    direction: (move ?? 0) > 0 ? "up" : (move ?? 0) < 0 ? "down" : "flat",
    currency: instrument.currency,
    asOf: input.asOf,
    source: input.source,
    status: assessment.status,
    marketState: assessment.marketState,
    freshnessReason: assessment.reason,
    history: input.history ?? [],
  };
}
