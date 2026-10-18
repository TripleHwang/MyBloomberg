import YahooFinance from "yahoo-finance2";
import type { Quote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { InstrumentDefinition } from "../domain/collection";
import type { MarketPoint } from "../domain/market";
import { fetchText, retry, type Fetcher } from "../collection/http";
import { finiteNumber, makePoint } from "./normalize";
import { normalizeFundamentals } from "./fundamentals";
import { normalizeFinancialHistory } from "./financial-history";

export interface MarketDataProvider {
  getPoint(instrument: InstrumentDefinition, now: Date): Promise<MarketPoint>;
  prepare?(instruments: InstrumentDefinition[]): Promise<void>;
}

export class YahooMarketProvider implements MarketDataProvider {
  private quotes = new Map<string, Quote>();
  private client = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
    versionCheck: false,
    queue: { concurrency: 4 },
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      dir: () => {},
    },
  });

  async prepare(instruments: InstrumentDefinition[]) {
    const symbols = instruments
      .filter((item) => item.provider === "yahoo")
      .map((item) => item.symbol);
    for (let offset = 0; offset < symbols.length; offset += 50) {
      try {
        const quotes = await retry(() =>
          this.client.quote(symbols.slice(offset, offset + 50)),
        );
        for (const quote of quotes) this.quotes.set(quote.symbol, quote);
      } catch {
        /* Each symbol still has its independent retry/fallback path. */
      }
    }
  }

  async getPoint(instrument: InstrumentDefinition, now: Date) {
    const quote =
      this.quotes.get(instrument.symbol) ??
      (await retry(() => this.client.quoteCombine(instrument.symbol)));
    const value = finiteNumber(quote.regularMarketPrice);
    if (value === null || !quote.regularMarketTime) throw new Error("No quote");
    let history: NonNullable<MarketPoint["history"]> = [];
    try {
      const chart = await this.client.chart(instrument.symbol, {
        period1: new Date(now.getTime() - 380 * 86_400_000),
        period2: now,
        interval: "1d",
      });
      history = chart.quotes
        .filter(
          (row) =>
            finiteNumber(row.close) !== null &&
            row.date.getTime() <= now.getTime(),
        )
        .map((row) => ({ time: row.date.toISOString(), value: row.close! }))
        .slice(-252);
    } catch {
      /* A history outage never discards a valid current quote. */
    }
    let summary: QuoteSummaryResult | null = null;
    if (instrument.assetClass === "equity") {
      try {
        summary = await this.client.quoteSummary(instrument.symbol, {
          modules:
            instrument.instrumentType === "etf"
              ? ["fundProfile", "summaryDetail", "defaultKeyStatistics"]
              : [
                  "financialData",
                  "defaultKeyStatistics",
                  "summaryDetail",
                  "assetProfile",
                ],
        });
      } catch {
        /* Keep quotes; incomplete fundamental coverage is explicit. */
      }
    }
    const point = makePoint(
      instrument,
      {
        value,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        asOf: quote.regularMarketTime.toISOString(),
        source: "Yahoo Finance",
        history,
      },
      now,
    );
    if (instrument.assetClass === "equity") {
      point.fundamentals = normalizeFundamentals(
        quote,
        summary,
        instrument,
        now,
      );
      if (instrument.instrumentType !== "etf") {
        try {
          const annual = await this.client.fundamentalsTimeSeries(
            instrument.symbol,
            {
              period1: new Date(now.getTime() - 6 * 366 * 86_400_000),
              period2: now,
              type: "annual",
              module: "all",
            },
          );
          point.fundamentals.history = normalizeFinancialHistory(
            annual,
            point.fundamentals.financialCurrency,
            now,
          );
        } catch {
          point.fundamentals.history = normalizeFinancialHistory(
            [],
            point.fundamentals.financialCurrency,
            now,
          );
          point.fundamentals.history.notes.push(
            "연간 재무 연결 실패 · 현재 시세와 재무 요약은 유지했습니다.",
          );
        }
      }
    }
    return point;
  }
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const scalar = (value: unknown): unknown =>
  typeof value === "object" && value !== null ? record(value)["#text"] : value;

export function parseTreasuryXml(
  xml: string,
  instrument: InstrumentDefinition,
  now: Date,
): MarketPoint {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE/i.test(xml))
    throw new Error("Invalid Treasury XML");
  const parsed = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
  }).parse(xml) as unknown;
  const entries = array(record(record(parsed).feed).entry);
  const field = instrument.symbol === "DGS2" ? "BC_2YEAR" : "BC_10YEAR";
  const observations = entries
    .flatMap((entry) => {
      const properties = record(record(record(entry).content).properties);
      const day = String(scalar(properties.NEW_DATE) ?? "").slice(0, 10);
      const raw = scalar(properties[field]);
      const value = typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      return /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(value) &&
        day <= now.toISOString().slice(0, 10)
        ? [{ time: day, value }]
        : [];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
  const current = observations.at(-1);
  if (!current) throw new Error("No Treasury observations");
  const previous = observations.at(-2);
  return makePoint(
    instrument,
    {
      value: current.value,
      change: previous ? current.value - previous.value : null,
      asOf: current.time,
      source: "U.S. Treasury",
      history: observations.slice(-20),
    },
    now,
  );
}

export class TreasuryRateProvider implements MarketDataProvider {
  private responses = new Map<number, Promise<string>>();
  constructor(private fetcher: Fetcher = fetch) {}
  private loadYear(year: number) {
    let pending = this.responses.get(year);
    if (!pending) {
      pending = retry(() =>
        fetchText(
          `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`,
          this.fetcher,
        ),
      );
      this.responses.set(year, pending);
    }
    return pending;
  }
  async getPoint(instrument: InstrumentDefinition, now: Date) {
    const current = await this.loadYear(now.getUTCFullYear());
    let point: MarketPoint;
    try {
      point = parseTreasuryXml(current, instrument, now);
    } catch {
      if (now.getUTCMonth() > 0) throw new Error("No Treasury observations");
      return parseTreasuryXml(
        await this.loadYear(now.getUTCFullYear() - 1),
        instrument,
        now,
      );
    }
    if (now.getUTCMonth() === 0 && (point.history?.length ?? 0) < 20) {
      try {
        const older = parseTreasuryXml(
          await this.loadYear(now.getUTCFullYear() - 1),
          instrument,
          now,
        );
        point.history = [
          ...(older.history ?? []),
          ...(point.history ?? []),
        ].slice(-20);
        if (point.change === null && point.history.length >= 2)
          point = makePoint(
            instrument,
            {
              value: point.value,
              asOf: point.asOf,
              source: point.source,
              change: point.history.at(-1)!.value - point.history.at(-2)!.value,
              history: point.history,
            },
            now,
          );
      } catch {
        /* Show the shorter observed history honestly. */
      }
    }
    return point;
  }
}

export function normalizeFred(
  payload: unknown,
  instrument: InstrumentDefinition,
  now: Date,
): MarketPoint {
  if (!Array.isArray(record(payload).observations))
    throw new Error("Invalid FRED response");
  const observations = array(record(payload).observations)
    .flatMap((row) => {
      const observation = record(row);
      const day = String(observation.date ?? "");
      const raw = observation.value;
      const value =
        typeof raw === "string" && raw.trim() && raw !== "."
          ? Number(raw)
          : NaN;
      return Number.isFinite(value) &&
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        day <= now.toISOString().slice(0, 10)
        ? [{ time: day, value }]
        : [];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
  const current = observations.at(-1);
  if (!current) throw new Error("No FRED observations");
  const previous = observations.at(-2);
  return makePoint(
    instrument,
    {
      value: current.value,
      change: previous ? current.value - previous.value : null,
      asOf: current.time,
      source: "FRED",
      history: observations.slice(-20),
    },
    now,
  );
}

export class FredRateProvider implements MarketDataProvider {
  constructor(
    private apiKey: string,
    private fetcher: Fetcher = fetch,
  ) {}
  async getPoint(instrument: InstrumentDefinition, now: Date) {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.search = new URLSearchParams({
      series_id: instrument.symbol,
      api_key: this.apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: "40",
    }).toString();
    // Never allow a raw network error (whose URL may contain the key) to reach logs.
    try {
      return await retry(async () =>
        normalizeFred(
          JSON.parse(await fetchText(url.toString(), this.fetcher)) as unknown,
          instrument,
          now,
        ),
      );
    } catch {
      throw new Error(
        "FRED 수집 실패 · 키 설정 또는 공급자 연결을 확인하세요.",
      );
    }
  }
}
