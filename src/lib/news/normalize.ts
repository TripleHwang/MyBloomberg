import { createHash } from "node:crypto";
import type { NewsItem } from "../domain/collection";

export function normalizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function cleanText(value: unknown, max = 600): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const topicRules = [
  {
    tag: "기업·실적",
    pattern:
      /earnings|revenue|profit|dividend|\bstocks?\b|\bshares?\b|apple|microsoft|amazon|alphabet|tesla|broadcom|banks?|실적|매출|이익|배당|주식|증시/i,
  },
  {
    tag: "환율",
    pattern:
      /currenc|forex|\beuro\b|\byen\b|yuan|sterling|환율|유로|달러|엔화|위안/i,
  },
  {
    tag: "매크로",
    pattern:
      /interest rate|inflation|federal reserve|\bfed\b|treasury|yield|금리|물가|통화|한국은행|경제|중앙은행/i,
  },
  {
    tag: "한국",
    pattern: /korea|kospi|kosdaq|won|한국|국내|원화|삼성|하이닉스/i,
  },
  {
    tag: "미국",
    pattern: /united states|\bu\.s\.|wall street|nasdaq|s&p|미국|뉴욕/i,
  },
  {
    tag: "원자재",
    pattern: /\boil\b|\bgold\b|crude|commodity|원유|금값|원자재/i,
  },
  {
    tag: "관심 종목",
    pattern: /nvidia|tsmc|samsung|hynix|엔비디아|삼성전자|하이닉스/i,
  },
  { tag: "디지털 자산", pattern: /bitcoin|crypto|비트코인|암호/i },
];

export function makeNews(input: {
  title: unknown;
  url: unknown;
  source: string;
  publishedAt: unknown;
  summary?: unknown;
  official?: boolean;
}): NewsItem | null {
  const title = cleanText(input.title, 300);
  const url = typeof input.url === "string" ? normalizeUrl(input.url) : null;
  const timestamp =
    typeof input.publishedAt === "string" ? Date.parse(input.publishedAt) : NaN;
  if (!title || !url || !Number.isFinite(timestamp)) return null;
  const summary = cleanText(input.summary);
  const tags = topicRules
    .filter((rule) => rule.pattern.test(`${title} ${summary}`))
    .map((rule) => rule.tag);
  if (input.official && !tags.length) tags.push("공식 발표");
  return {
    id: `news-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
    title,
    url,
    source: cleanText(input.source, 100),
    publishedAt: new Date(timestamp).toISOString(),
    summary,
    tags,
    score: tags.length * 3 + (input.official ? 5 : 0),
  };
}

function titleTokens(title: string) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1),
  );
}
function similar(a: string, b: string) {
  const left = titleTokens(a),
    right = titleTokens(b);
  if (!left.size || !right.size) return a.toLowerCase() === b.toLowerCase();
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / new Set([...left, ...right]).size >= 0.8;
}

export function selectNews(items: NewsItem[], now = new Date()): NewsItem[] {
  const cutoff = now.getTime() - 24 * 3_600_000;
  const sorted = items
    .filter(
      (item) =>
        Date.parse(item.publishedAt) >= cutoff &&
        Date.parse(item.publishedAt) <= now.getTime() &&
        item.tags.length,
    )
    .sort(
      (a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt),
    );
  const selected: NewsItem[] = [];
  const counts = new Map<string, number>();
  for (const item of sorted) {
    const publisher = new URL(item.url).hostname.replace(/^www\./, "");
    if (
      (counts.get(publisher) ?? 0) >= 6 ||
      selected.some(
        (entry) => entry.url === item.url || similar(entry.title, item.title),
      )
    )
      continue;
    selected.push(item);
    counts.set(publisher, (counts.get(publisher) ?? 0) + 1);
    if (selected.length >= 30) break;
  }
  return selected;
}
