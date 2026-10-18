// @vitest-environment node
import { describe, expect, it } from "vitest";
import { coreInstruments } from "./instruments";
import { assessFreshness } from "./freshness";
import { makePoint } from "./normalize";
import { normalizeFred, parseTreasuryXml } from "./providers";

const get = (id: string) => coreInstruments.find((point) => point.id === id)!;

describe("market normalization and freshness", () => {
  it("keeps missing values distinct from a genuine zero", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(
      makePoint(
        get("btc"),
        { value: NaN, asOf: now.toISOString(), source: "test" },
        now,
      ).status,
    ).toBe("missing");
    expect(
      makePoint(
        get("btc"),
        { value: 0, asOf: now.toISOString(), source: "test" },
        now,
      ).displayValue,
    ).toBe("$0.00");
  });
  it("accepts Friday US close through the weekend, then expires it at Monday open", () => {
    const asOf = "2026-10-16T20:00:00Z";
    expect(
      assessFreshness(
        get("nasdaq"),
        asOf,
        100,
        new Date("2026-10-18T22:00:00Z"),
      ).status,
    ).toBe("fresh");
    expect(
      assessFreshness(
        get("nasdaq"),
        asOf,
        100,
        new Date("2026-10-19T13:00:00Z"),
      ).status,
    ).toBe("fresh");
    expect(
      assessFreshness(
        get("nasdaq"),
        asOf,
        100,
        new Date("2026-10-19T14:00:00Z"),
      ).status,
    ).toBe("stale");
  });
  it("does not bless an old close simply because the market is closed", () => {
    expect(
      assessFreshness(
        get("kospi"),
        "2026-10-15T06:30:00Z",
        100,
        new Date("2026-10-18T01:00:00Z"),
      ).status,
    ).toBe("stale");
  });
  it("handles US daylight saving using the exchange timezone", () => {
    const now = new Date("2026-01-12T14:40:00Z");
    expect(
      assessFreshness(get("nasdaq"), "2026-01-12T14:35:00Z", 100, now)
        .marketState,
    ).toBe("open");
  });
  it("expires crypto on weekends and checks forex session opening", () => {
    const weekend = new Date("2026-10-18T12:00:00Z");
    expect(
      assessFreshness(get("btc"), "2026-10-18T11:00:00Z", 100, weekend).status,
    ).toBe("stale");
    expect(
      assessFreshness(get("usdkrw"), "2026-10-16T21:00:00Z", 100, weekend)
        .status,
    ).toBe("fresh");
    expect(
      assessFreshness(
        get("usdkrw"),
        "2026-10-16T21:00:00Z",
        100,
        new Date("2026-10-19T00:00:00Z"),
      ).status,
    ).toBe("stale");
  });
  it("uses daily rate observation dates, not the collection time", () => {
    expect(
      assessFreshness(
        get("us10y"),
        "2026-10-16",
        4,
        new Date("2026-10-18T12:00:00Z"),
      ).status,
    ).toBe("fresh");
    expect(
      assessFreshness(
        get("us10y"),
        "2026-10-15",
        4,
        new Date("2026-10-18T12:00:00Z"),
      ).status,
    ).toBe("stale");
  });
  it("computes FRED basis points and excludes missing observations", () => {
    const point = normalizeFred(
      {
        observations: [
          { date: "2026-10-16", value: "4.21" },
          { date: "2026-10-15", value: "." },
          { date: "2026-10-14", value: "4.17" },
        ],
      },
      get("us10y"),
      new Date("2026-10-18T12:00:00Z"),
    );
    expect(point.value).toBe(4.21);
    expect(point.displayChange).toBe("+4.0 bp");
    expect(point.history).toHaveLength(2);
    expect(point.source).toBe("FRED");
  });
  it("reads namespaced Treasury daily rates without requiring a key", () => {
    const xml =
      '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="test" xmlns:m="meta"><entry><content><m:properties><d:NEW_DATE>2026-10-15T00:00:00</d:NEW_DATE><d:BC_2YEAR>3.93</d:BC_2YEAR><d:BC_10YEAR>4.17</d:BC_10YEAR></m:properties></content></entry><entry><content><m:properties><d:NEW_DATE>2026-10-16T00:00:00</d:NEW_DATE><d:BC_2YEAR>3.97</d:BC_2YEAR><d:BC_10YEAR>4.21</d:BC_10YEAR></m:properties></content></entry></feed>';
    const point = parseTreasuryXml(
      xml,
      get("us2y"),
      new Date("2026-10-18T12:00:00Z"),
    );
    expect(point.value).toBe(3.97);
    expect(point.displayChange).toBe("+4.0 bp");
    expect(point.source).toBe("U.S. Treasury");
    expect(() =>
      parseTreasuryXml("<html></html>", get("us2y"), new Date()),
    ).toThrow();
  });
});
