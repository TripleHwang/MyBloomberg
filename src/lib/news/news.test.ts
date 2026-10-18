// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeNews, normalizeUrl, selectNews } from "./normalize";
import { collectNews, parseGdelt, parseRss } from "./providers";

const now = new Date("2026-10-18T12:00:00Z");
const article = (index: number, source = "https://news.example.com") =>
  makeNews({
    title: `Korea market ${["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"][index % 8]} policy ${index}`,
    url: `${source}/story-${index}`,
    source: "Example",
    publishedAt: "2026-10-18T08:00:00Z",
    official: true,
  })!;

describe("news ingestion", () => {
  it("canonicalizes tracking links and rejects unsafe protocols", () => {
    expect(
      normalizeUrl("https://www.example.com/news/?utm_source=feed&b=2&a=1#x"),
    ).toBe("https://example.com/news/?a=1&b=2");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("https://user:pass@example.com")).toBeNull();
  });
  it("removes duplicate links and near-identical syndicated titles", () => {
    const first = article(0);
    const duplicate = { ...first, url: "https://other.example.com/article" };
    expect(selectNews([first, duplicate, { ...first }], now)).toHaveLength(1);
  });
  it("enforces the 24 hour window, six per publisher, and thirty overall", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      ...article(i, `https://source${Math.floor(i / 8)}.example.com`),
      title: `Korea article${i} content${i} topic${i} subject${i}`,
    }));
    const result = selectNews(rows, now);
    expect(result).toHaveLength(30);
    expect(result.filter((row) => row.url.includes("source0."))).toHaveLength(
      6,
    );
    expect(
      selectNews(
        [
          { ...article(0), publishedAt: "2026-10-17T01:00:00Z" },
          { ...article(1), publishedAt: "2026-10-19T01:00:00Z" },
        ],
        now,
      ),
    ).toHaveLength(0);
  });
  it("parses RSS and Atom metadata without retaining full article bodies", () => {
    const rss =
      '<rss><channel><item><title>한국은행 금리 발표</title><link>https://bok.or.kr/news/1</link><pubDate>Sun, 18 Oct 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>공개 요약</p>]]></description><content:encoded xmlns:content="content">DO NOT STORE BODY</content:encoded></item></channel></rss>';
    expect(parseRss(rss, "BOK")[0].summary).toBe("공개 요약");
    expect(JSON.stringify(parseRss(rss, "BOK"))).not.toContain(
      "DO NOT STORE BODY",
    );
    const atom =
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Federal Reserve rate</title><link href="https://federalreserve.gov/news/1"/><updated>2026-10-18T08:00:00Z</updated><summary>Public summary</summary></entry></feed>';
    expect(parseRss(atom, "Fed")[0].url).toBe(
      "https://federalreserve.gov/news/1",
    );
    expect(() => parseRss("<html>blocked</html>", "SEC")).toThrow();
  });
  it("handles GDELT date format and rejects non-article payloads", () => {
    expect(
      parseGdelt({
        articles: [
          {
            title: "Nvidia market",
            url: "https://example.com/one",
            domain: "example.com",
            seendate: "20261018T080000Z",
          },
        ],
      })[0].publishedAt,
    ).toBe("2026-10-18T08:00:00.000Z");
    expect(() => parseGdelt({ error: "rate limited" })).toThrow();
  });
  it("distinguishes a successful quiet feed from an unavailable provider", async () => {
    const fetcher = async (input: string | URL | Request) =>
      String(input).includes("gdelt")
        ? new Response('{"articles":[]}', { status: 200 })
        : new Response("<rss><channel></channel></rss>", { status: 200 });
    const result = await collectNews(now, fetcher as typeof fetch);
    expect(result.news).toHaveLength(0);
    expect(result.sources.every((source) => source.status === "ok")).toBe(true);
  });
});
