import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { NewsItem, SourceHealth } from "../domain/collection";
import {
  fetchText,
  ProviderHttpError,
  retry,
  type Fetcher,
} from "../collection/http";
import { makeNews, selectNews } from "./normalize";

export const newsFeeds = [
  {
    id: "fed",
    label: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
  },
  {
    id: "fed-speeches",
    label: "Fed Speeches",
    url: "https://www.federalreserve.gov/feeds/speeches.xml",
  },
  {
    id: "bok",
    label: "한국은행",
    url: "https://www.bok.or.kr/portal/bbs/P0002017/news.rss?menuNo=200365",
  },
  {
    id: "sec",
    label: "SEC",
    url: "https://www.sec.gov/news/pressreleases.rss",
  },
  {
    id: "cnbc-finance",
    label: "CNBC Finance",
    url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    official: false,
  },
  {
    id: "cnbc-asia",
    label: "CNBC Asia",
    url: "https://www.cnbc.com/id/19832390/device/rss/rss.html",
    official: false,
  },
];
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const string = (value: unknown) =>
  typeof value === "string" ? value : String(object(value)["#text"] ?? "");

export function parseRss(
  xml: string,
  source: string,
  official = true,
): NewsItem[] {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE/i.test(xml))
    throw new Error("Invalid RSS XML");
  const root = object(
    new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      removeNSPrefix: true,
      parseTagValue: false,
    }).parse(xml) as unknown,
  );
  const channel = object(object(root.rss).channel);
  const feed = object(root.feed);
  if (!root.rss && !root.feed) throw new Error("Not a news feed");
  return list(channel.item ?? feed.entry).flatMap((entry) => {
    const row = object(entry);
    const link =
      typeof row.link === "string"
        ? row.link
        : list(row.link)
            .map(object)
            .find((item) => !item["@rel"] || item["@rel"] === "alternate")?.[
            "@href"
          ];
    const item = makeNews({
      title: string(row.title),
      url: link,
      source,
      publishedAt: string(
        row.pubDate ?? row.published ?? row.updated ?? row.date,
      ),
      summary: string(row.description ?? row.summary),
      official,
    });
    return item ? [{ ...item, timeKind: "published" as const }] : [];
  });
}

export function parseGdelt(payload: unknown): NewsItem[] {
  const response = object(payload);
  if (!Array.isArray(response.articles))
    throw new Error("Invalid GDELT response");
  return response.articles.flatMap((entry) => {
    const row = object(entry);
    const date = string(row.seendate).replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    );
    const item = makeNews({
      title: row.title,
      url: row.url,
      source: string(row.domain) || "GDELT",
      publishedAt: date,
    });
    return item ? [{ ...item, timeKind: "discovered" as const }] : [];
  });
}

export async function collectNews(
  now: Date,
  fetcher: Fetcher = fetch,
): Promise<{ news: NewsItem[]; sources: SourceHealth[] }> {
  const gdelt = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  gdelt.search = new URLSearchParams({
    query:
      '("Federal Reserve" OR "US Treasury" OR "South Korea" OR "Nvidia" OR "TSMC" OR "Samsung" OR "crude oil" OR "Bitcoin")',
    mode: "artlist",
    format: "json",
    timespan: "24h",
    maxrecords: "150",
    sort: "hybridrel",
  }).toString();
  const definitions = [
    ...newsFeeds,
    { id: "gdelt", label: "GDELT", url: gdelt.toString() },
  ];
  const results = await Promise.all(
    definitions.map(async (definition) => {
      try {
        const items = await retry(async () => {
          const raw = await fetchText(definition.url, fetcher);
          return definition.id === "gdelt"
            ? parseGdelt(JSON.parse(raw) as unknown)
            : parseRss(
                raw,
                definition.label,
                !("official" in definition) || definition.official !== false,
              );
        });
        const recent = selectNews(items, now);
        return {
          items: recent,
          health: {
            id: definition.id,
            label: definition.label,
            kind: "news" as const,
            status: "ok" as const,
            count: recent.length,
            checkedAt: now.toISOString(),
            message: recent.length
              ? `최근 24시간 ${recent.length}건${definition.id === "gdelt" ? " · 기사 발행일 대신 GDELT 발견 시각 기준" : ""}`
              : "최근 24시간에 해당하는 새 항목이 없습니다.",
          },
        };
      } catch (error) {
        const message =
          error instanceof ProviderHttpError && error.status === 429
            ? "공급자 요청 제한(429) · 간격을 두고 재시도했지만 제한이 유지되었습니다. 잠시 후 다시 수집하세요."
            : "재시도 후 수집 실패 · 연결 또는 공급자 상태를 확인하세요.";
        return {
          items: [],
          health: {
            id: definition.id,
            label: definition.label,
            kind: "news" as const,
            status: "error" as const,
            count: 0,
            checkedAt: now.toISOString(),
            message,
          },
        };
      }
    }),
  );
  return {
    news: selectNews(
      results.flatMap((result) => result.items),
      now,
    ),
    sources: results.map((result) => result.health),
  };
}
