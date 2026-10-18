import type { AssetClass, MarketPoint } from "@/lib/domain/market";
import type { CollectionStage } from "@/lib/domain/collection";

export const assetNames: Record<AssetClass, string> = {
  index: "지수",
  equity: "주식·ETF",
  fx: "환율",
  rate: "미국 금리",
  commodity: "원자재",
  crypto: "암호자산",
};
export const statusNames = { fresh: "정상", stale: "지연", missing: "누락" };
export const stageNames: Record<CollectionStage, string> = {
  collecting: "시장·뉴스 수집 중",
  validating: "데이터 품질 검증 중",
  saving: "로컬 스냅샷 저장 중",
  completed: "수집 완료",
  failed: "수집 실패",
};
export function kst(value: string | null | undefined, date = false) {
  if (!value || Number.isNaN(Date.parse(value))) return "기준 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(date ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function fullKst(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return "기준 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function observationTime(
  value: string | null | undefined,
  full = false,
) {
  if (!value) return "기준 시각 없음";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} · 일별 공시`;
  return `${full ? fullKst(value) : kst(value, true)} KST`;
}
export function marketStateName(value: MarketPoint["marketState"]) {
  return {
    open: "장중",
    closed: "장 마감",
    pre: "장전",
    post: "장후",
    unknown: "거래 상태 미확인",
  }[value || "unknown"];
}
export function quoteUrl(point: MarketPoint) {
  if (point.source.toLowerCase().includes("fred"))
    return `https://fred.stlouisfed.org/series/${encodeURIComponent(point.symbol)}`;
  if (
    point.source.toLowerCase().includes("treasury") ||
    point.assetClass === "rate"
  )
    return "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve";
  return `https://finance.yahoo.com/quote/${encodeURIComponent(point.symbol)}/`;
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    overview: (
      <>
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      </>
    ),
    macro: (
      <>
        <path d="M3 17l5-6 4 3 8-10M15 4h5v5M3 21h18" />
      </>
    ),
    equities: (
      <>
        <path d="M5 5v14M2 9h6M13 2v18M10 6h6M21 7v15M18 15h6" />
      </>
    ),
    news: (
      <>
        <path d="M5 4h15v17H5zM2 7v14h3M8 8h9M8 12h9M8 16h5" />
      </>
    ),
    archive: (
      <>
        <path d="M3 3h18v5H3zM5 8v13h14V8M9 12h6" />
      </>
    ),
    sources: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18" />
      </>
    ),
    settings: (
      <>
        <path d="M3 6h18M3 12h18M3 18h18" />
        <path d="M7 3v6M17 9v6M9 15v6" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7M21 3L10 14M10 3H3v18h18v-7" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 8a8 8 0 10.2 7M20 3v5h-5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M16 16l5 5" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6L6 18" />,
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4" />
      </>
    ),
    check: <path d="M4 12l5 5L20 6" />,
    warning: (
      <>
        <path d="M12 3L2 21h20L12 3zM12 9v5M12 17v1" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}

export function Sparkline({
  values,
  direction,
}: {
  values: number[];
  direction: string;
}) {
  if (values.length < 2)
    return (
      <span className="sd-spark-empty" aria-hidden="true">
        —
      </span>
    );
  const min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 120},${32 - ((v - min) / range) * 28}`,
    )
    .join(" ");
  return (
    <svg
      className={`sd-spark move-${direction}`}
      viewBox="0 0 120 36"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
