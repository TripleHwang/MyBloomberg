import { coreInstruments } from "../src/lib/market-data/instruments";
import {
  TreasuryRateProvider,
  YahooMarketProvider,
} from "../src/lib/market-data/providers";
import { collectNews } from "../src/lib/news/providers";

const now = new Date();
const checks = await Promise.allSettled([
  new YahooMarketProvider().getPoint(
    coreInstruments.find((point) => point.id === "nasdaq")!,
    now,
  ),
  new TreasuryRateProvider().getPoint(
    coreInstruments.find((point) => point.id === "us10y")!,
    now,
  ),
  collectNews(now),
]);
for (const [index, result] of checks.entries()) {
  if (result.status === "rejected") {
    console.log(
      JSON.stringify({
        provider: index === 0 ? "Yahoo Finance" : "U.S. Treasury",
        status: "failed",
      }),
    );
    continue;
  }
  const value = result.value;
  if ("sources" in value)
    console.log(
      JSON.stringify(
        {
          provider: "News",
          sources: value.sources,
          articles: value.news.length,
        },
        null,
        2,
      ),
    );
  else
    console.log(
      JSON.stringify({
        provider: value.source,
        value: value.value,
        asOf: value.asOf,
        status: value.status,
        historyCount: value.history?.length,
      }),
    );
}
