import type { CollectionSnapshot, SourceHealth } from "../domain/collection";
import type { MarketPoint } from "../domain/market";

export function assessQuality(
  points: MarketPoint[],
  sources: SourceHealth[],
): CollectionSnapshot["quality"] {
  const get = (id: string) => points.find((point) => point.id === id);
  const critical: Array<[string, boolean]> = [
    [
      "미국 지수",
      ["sp500", "nasdaq", "dow"].every((id) => get(id)?.value == null),
    ],
    ["USD/KRW", get("usdkrw")?.value == null],
    ["미국 국채 10년", get("us10y")?.value == null],
  ];
  const missingCritical = critical
    .filter(([, missing]) => missing)
    .map(([label]) => label);
  const newsSources = sources.filter((source) => source.kind === "news");
  const successfulNews = newsSources.filter(
    (source) => source.status === "ok",
  ).length;
  const fresh = points.filter((point) => point.status === "fresh").length;
  const stale = points.filter((point) => point.status === "stale").length;
  const missing = points.filter((point) => point.status === "missing").length;
  const warnings = [
    "신선도는 평일 정규 거래 시간·미 동부 18시 금리 공시를 기준으로 판단하며 거래소 공휴일은 자동 반영하지 않습니다.",
  ];
  if (stale)
    warnings.push(
      `${stale}개 항목이 지연 상태입니다. 개별 기준 시각을 확인하세요.`,
    );
  if (missing) warnings.push(`${missing}개 항목을 수집하지 못했습니다.`);
  if (!successfulNews)
    warnings.push("NEWS DEGRADED · 모든 뉴스 공급자가 응답하지 않았습니다.");
  if (missingCritical.length >= 2)
    warnings.push("핵심 데이터가 부족해 후속 정상 리포트 생성을 제한합니다.");
  return {
    fresh,
    stale,
    missing,
    newsStatus: !successfulNews
      ? "unavailable"
      : successfulNews < newsSources.length
        ? "degraded"
        : "ok",
    readyForReport: missingCritical.length < 2,
    missingCritical,
    warnings,
  };
}
