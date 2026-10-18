// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CollectionSnapshot } from "../domain/collection";
import { fixtureSnapshot } from "../collection/fixtures";
import {
  collectionInstruments,
  defaultWatchlist,
} from "../market-data/instruments";
import { analyzeSnapshot } from "./analyze";
import { deriveFinancials } from "./financials";
import { comparePeers, annualValuation } from "./peers";
import { newsImpact } from "./news";

const now = new Date("2026-10-18T07:00:00Z");
function fixture(): CollectionSnapshot {
  const snapshot = fixtureSnapshot(
    "2026-10-18_160000000_aaaaaaaa",
    collectionInstruments(defaultWatchlist),
    now,
  );
  return {
    ...snapshot,
    mode: "live",
    news: [],
    quality: { ...snapshot.quality, newsStatus: "ok" },
  };
}
function stock(snapshot: CollectionSnapshot, symbol = "NVDA") {
  return snapshot.marketPoints.find((point) => point.symbol === symbol)!;
}
function subset(): CollectionSnapshot {
  const snapshot = fixture();
  snapshot.marketPoints = snapshot.marketPoints.filter((point) =>
    ["NVDA", "AMD", "AVGO", "TSM"].includes(point.symbol),
  );
  snapshot.marketPoints.forEach((point) => {
    point.fundamentals!.industryKey = "semiconductors";
    point.fundamentals!.industry = "Semiconductors";
    point.fundamentals!.trailingPE = 25;
    point.fundamentals!.priceToBook = 4;
  });
  return snapshot;
}
function article(
  id: string,
  title: string,
  url = `https://www.cnbc.com/${id}`,
) {
  return {
    id,
    title,
    url,
    summary: "",
    source: "CNBC",
    publishedAt: "2026-10-18T06:00:00Z",
    tags: ["기업·실적"],
    score: 1,
  };
}

describe("balanced deterministic scoring", () => {
  it("keeps scores, selected candidates and hashes independent of point/news/annual array ordering", () => {
    const input = subset();
    input.news = [
      article("news-one", "Nvidia raises full-year guidance"),
      article("news-two", "AMD reports quarterly results"),
    ];
    const a = analyzeSnapshot(input),
      reordered = structuredClone(input);
    reordered.marketPoints.reverse();
    reordered.news.reverse();
    for (const point of reordered.marketPoints)
      point.fundamentals!.history!.periods.reverse();
    expect(analyzeSnapshot(reordered)).toEqual(a);
    const differentId = { ...input, id: "2026-10-18_160000000_bbbbbbbb" };
    expect(analyzeSnapshot(differentId)).toEqual(a);
  });
  it("does not count missing metrics as zero or promote insufficient coverage", () => {
    const input = subset(),
      point = stock(input);
    point.fundamentals!.history!.periods = [];
    point.fundamentals!.history!.status = "missing";
    const result = analyzeSnapshot(input).scores.find(
      (row) => row.symbol === point.symbol,
    )!;
    expect(result.totalScore).toBeNull();
    expect(result.action).toBe("watch");
    expect(result.eligible).toBe(false);
    expect(
      result.components.find((item) => item.key === "growth")!.metrics[0]
        .points,
    ).toBeNull();
    expect(result.blockers.join(" ")).toContain("3개 회계연도");
  });
  it("requires other same-industry peers and excludes self, stale and misaligned fiscal years", () => {
    const input = subset(),
      target = stock(input);
    const peers = comparePeers(target, input.marketPoints);
    expect(peers.count).toBe(3);
    expect(peers.symbols).not.toContain("NVDA");
    stock(input, "AMD").status = "stale";
    stock(input, "AVGO").fundamentals!.industryKey = "software-infrastructure";
    stock(input, "TSM").fundamentals!.history!.periods.forEach((row) => {
      row.periodEnd = row.periodEnd.replace("2025", "2023");
    });
    expect(comparePeers(target, input.marketPoints).count).toBe(0);
    const score = analyzeSnapshot(input).scores.find(
      (item) => item.symbol === "NVDA",
    )!;
    expect(score.action).toBe("watch");
    expect(score.blockers.join(" ")).toContain("2개");
  });
  it("handles losses and non-positive equity without manufacturing earnings growth or cheap PE", () => {
    const input = subset(),
      target = stock(input);
    target.fundamentals!.trailingPE = -5;
    target.fundamentals!.history!.periods.forEach((row) => {
      row.netIncome = -Math.abs(row.netIncome!);
      row.totalEquity = -10;
      row.freeCashFlow = -Math.abs(row.freeCashFlow!);
    });
    const result = analyzeSnapshot(input).scores.find(
      (item) => item.symbol === "NVDA",
    )!;
    expect(result.trend.earningsCagr).toBeNull();
    expect(
      result.components
        .find((item) => item.key === "peers")
        ?.metrics.find((item) => item.key === "annualPE")?.points,
    ).toBe(0);
    expect(
      result.components
        .find((item) => item.key === "stability")
        ?.metrics.find((item) => item.key === "debtEquity")?.points,
    ).toBe(0);
    expect(result.action).toBe("sell");
  });
  it("keeps ratio scores invariant to reporting-currency scale and checks annual continuity", () => {
    const input = subset(),
      before = analyzeSnapshot(input);
    const converted = structuredClone(input),
      target = stock(converted);
    for (const period of target.fundamentals!.history!.periods)
      for (const key of [
        "revenue",
        "netIncome",
        "operatingCashFlow",
        "capitalExpenditure",
        "freeCashFlow",
        "totalDebt",
        "totalEquity",
        "totalAssets",
      ] as const)
        if (period[key] !== null) period[key]! *= 1000;
    target.fundamentals!.marketCap! *= 1000;
    expect(
      analyzeSnapshot(converted).scores.find((row) => row.symbol === "NVDA")!
        .totalScore,
    ).toBe(before.scores.find((row) => row.symbol === "NVDA")!.totalScore);
    stock(input).fundamentals!.history!.periods.splice(1, 1);
    expect(
      analyzeSnapshot(input)
        .scores.find((row) => row.symbol === "NVDA")!
        .blockers.join(" "),
    ).toContain("연속");
  });
  it("does not treat a bank's negative operating cash flow as corporate financial deterioration", () => {
    const input = fixture(),
      bank = stock(input, "JPM");
    bank.fundamentals!.industryKey = "banks-diversified";
    const initial = analyzeSnapshot(input).scores.find(
      (row) => row.symbol === "JPM",
    )!;
    for (const year of bank.fundamentals!.history!.periods)
      year.freeCashFlow = -1e20;
    const result = analyzeSnapshot(input).scores.find(
      (row) => row.symbol === "JPM",
    )!;
    expect(result.model).toBe("financial");
    expect(result.baseScore).toBe(initial.baseScore);
    expect(result.action).toBe("watch");
    expect(result.blockers.join(" ")).toContain("규제자본");
  });
  it("uses a separate ETF model, preserves a true zero fee and needs observed history", () => {
    const input = fixture(),
      etf = stock(input, "SPY");
    etf.fundamentals!.expenseRatio = 0;
    const result = analyzeSnapshot(input).scores.find(
      (row) => row.symbol === "SPY",
    )!;
    expect(result.model).toBe("etf");
    expect(result.components.find((row) => row.key === "cost")?.points).toBe(
      30,
    );
    expect(result.components.some((row) => row.key === "growth")).toBe(false);
    expect(result.action).toBe("watch");
    expect(result.blockers.join(" ")).toContain("200개");
  });
  it("calculates CAGR over actual annual fiscal dates rather than one-day price movement", () => {
    const input = subset(),
      target = stock(input, "AMD");
    const trend = deriveFinancials(target).trend;
    expect(trend.years).toBe(4);
    expect(trend.revenueCagr).toBeCloseTo(0.15, 3);
    const result = analyzeSnapshot(input).scores.find(
      (row) => row.symbol === "NVDA",
    )!.totalScore;
    target.changePercent = 999;
    target.displayChange = "+999%";
    expect(
      analyzeSnapshot(input).scores.find((row) => row.symbol === "NVDA")!
        .totalScore,
    ).toBe(result);
  });
  it("computes annual valuation consistently across currency and blocks unavailable FX", () => {
    const input = fixture(),
      target = stock(input, "TSM");
    const original = annualValuation(target, input.marketPoints);
    target.fundamentals!.history!.currency = "TWD";
    for (const year of target.fundamentals!.history!.periods) {
      year.netIncome! *= 32;
      year.totalEquity! *= 32;
    }
    const fx = input.marketPoints.find((point) => point.symbol === "TWD=X")!;
    fx.value = 32;
    fx.status = "fresh";
    const converted = annualValuation(target, input.marketPoints);
    expect(converted.pe).toBeCloseTo(original.pe!);
    expect(converted.pb).toBeCloseTo(original.pb!);
    expect(converted.conversion).toContain("× 32");
    const first = analyzeSnapshot(input).inputHash;
    fx.value = 34;
    expect(analyzeSnapshot(input).inputHash).not.toBe(first);
    fx.status = "stale";
    expect(annualValuation(target, input.marketPoints).pe).toBeNull();
  });
});

describe("reproducible news attribution", () => {
  it("records a classification change only when a fixed news adjustment crosses the threshold with all other gates met", () => {
    const snapshot = subset();
    for (const point of snapshot.marketPoints) {
      point.fundamentals!.marketCap = 500;
      point.fundamentals!.history!.periods.forEach((year, index) => {
        const revenue = 100 * 1.1 ** index;
        Object.assign(year, {
          revenue,
          netIncome: revenue * 0.14,
          freeCashFlow: revenue * 0.1,
          totalEquity: 100,
          totalDebt: 50,
          totalAssets: 200,
        });
      });
    }
    const before = analyzeSnapshot(snapshot).scores.find(
      (row) => row.symbol === "AMD",
    )!;
    expect(before.eligible).toBe(true);
    expect(before.baseScore).toBeGreaterThanOrEqual(68);
    expect(before.baseScore).toBeLessThan(70);
    expect(before.action).toBe("watch");
    snapshot.news = [article("guidance", "AMD raises full-year guidance")];
    const after = analyzeSnapshot(snapshot).scores.find(
      (row) => row.symbol === "AMD",
    )!;
    expect(after.news.adjustment).toBe(2);
    expect(after.totalScore).toBeCloseTo(before.baseScore! + 2, 2);
    expect(after.action).toBe("buy");
    expect(after.news.beforeAction).toBe("watch");
    expect(after.news.changedAction).toBe(true);
  });
  it("links direct company and weaker industry news, while preserving zero for price-only or mixed reports", () => {
    const snapshot = subset(),
      target = stock(snapshot);
    snapshot.news = [
      article("up", "Nvidia raises full-year guidance"),
      article("sector", "Semiconductor market to remain solid"),
      article("price", "Nvidia shares rally to record high"),
      article("mixed", "Nvidia earnings beat expectations but cuts guidance"),
    ];
    const news = newsImpact(target, snapshot);
    expect(news.items.find((item) => item.newsId === "up")?.contribution).toBe(
      2,
    );
    expect(
      news.items.find((item) => item.newsId === "sector")?.contribution,
    ).toBe(0.25);
    expect(
      news.items.find((item) => item.newsId === "price")?.contribution,
    ).toBe(0);
    expect(
      news.items.find((item) => item.newsId === "mixed")?.contribution,
    ).toBe(0);
    expect(news.adjustment).toBe(2.25);
  });
  it("does not amplify repeated events or apply untrusted, future, old or ambiguous company-name reports", () => {
    const snapshot = subset(),
      target = stock(snapshot);
    snapshot.news = [
      article("a", "Nvidia raises guidance"),
      article("b", "Nvidia raises full-year guidance"),
      article(
        "untrusted",
        "Nvidia files for bankruptcy",
        "https://unknown.invalid/story",
      ),
      {
        ...article("future", "Nvidia cuts guidance"),
        publishedAt: "2026-10-19T00:00:00Z",
      },
      {
        ...article("old", "Nvidia cuts guidance"),
        publishedAt: "2026-10-16T00:00:00Z",
      },
      article("uncertain", "Nvidia may raise guidance"),
    ];
    const news = newsImpact(target, snapshot);
    expect(news.adjustment).toBe(2);
    expect(news.items.filter((item) => item.contribution === 2)).toHaveLength(
      1,
    );
    expect(
      news.items.find((item) => item.newsId === "untrusted")?.contribution,
    ).toBe(0);
    expect(
      news.items.some(
        (item) => item.newsId === "future" || item.newsId === "old",
      ),
    ).toBe(false);
    expect(
      news.items.find((item) => item.newsId === "uncertain")?.contribution,
    ).toBe(0);
    const samsung = stock(fixture(), "005930.KS");
    snapshot.news = [article("samsung", "Samsung Fire raises guidance")];
    expect(newsImpact(samsung, snapshot).items).toHaveLength(0);
  });
  it("caps the news adjustment and differentiates unavailable coverage from no matching news", () => {
    const snapshot = subset(),
      target = stock(snapshot);
    snapshot.news = [
      article("1", "Nvidia cuts guidance"),
      article("2", "Nvidia earnings miss estimates"),
      article("3", "Nvidia cuts dividend"),
      article("4", "Nvidia files for bankruptcy"),
      article("5", "Nvidia financial restatement"),
    ];
    const news = newsImpact(target, snapshot);
    expect(news.adjustment).toBe(-5);
    expect(
      news.items.reduce((sum, item) => sum + item.contribution, 0),
    ).toBeCloseTo(-5, 8);
    expect(
      news.items.every(
        (item) => Number(item.contribution.toFixed(2)) === item.contribution,
      ),
    ).toBe(true);
    snapshot.news = [];
    expect(newsImpact(target, snapshot).status).toBe("no-match");
    snapshot.quality.newsStatus = "unavailable";
    expect(newsImpact(target, snapshot).status).toBe("unavailable");
  });
});
