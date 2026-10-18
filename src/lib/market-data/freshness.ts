import type { DataStatus, MarketPoint } from "../domain/market";
import type { InstrumentDefinition } from "../domain/collection";

export function zonedParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "0";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    day,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: new Date(`${day}T12:00:00Z`).getUTCDay(),
  };
}

export function previousWeekday(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}

export function assessFreshness(
  instrument: InstrumentDefinition,
  asOf: string | null,
  value: number | null,
  now = new Date(),
): {
  status: DataStatus;
  reason: string;
  marketState: NonNullable<MarketPoint["marketState"]>;
} {
  if (value === null || !asOf || !Number.isFinite(Date.parse(asOf)))
    return {
      status: "missing",
      reason: "유효한 관측값이 없습니다.",
      marketState: "unknown",
    };
  const age = now.getTime() - Date.parse(asOf);
  if (age < -300_000)
    return {
      status: "stale",
      reason: "공급자 기준 시각이 현재보다 미래입니다.",
      marketState: "unknown",
    };
  if (instrument.assetClass === "crypto")
    return {
      status: age <= 30 * 60_000 ? "fresh" : "stale",
      reason: "24시간 거래 · 기준 시각 30분 이내",
      marketState: "open",
    };
  const zone = instrument.region === "KR" ? "Asia/Seoul" : "America/New_York";
  const local = zonedParts(now, zone);
  const observed = zonedParts(new Date(asOf), zone);
  const weekday = local.weekday > 0 && local.weekday < 6;
  if (instrument.assetClass === "rate") {
    // H.15 / daily Treasury data is assessed after the daily publication window.
    const expected =
      weekday && local.minute >= 18 * 60
        ? local.day
        : previousWeekday(local.day);
    const observationDay = asOf.slice(0, 10);
    return {
      status: observationDay >= expected ? "fresh" : "stale",
      reason: `일별 공시 · 기대 관측일 ${expected} (미 동부 18시 기준, 공휴일 미반영)`,
      marketState: "closed",
    };
  }
  if (instrument.assetClass === "fx" || instrument.assetClass === "commodity") {
    const trading =
      (local.weekday >= 1 && local.weekday <= 4) ||
      (local.weekday === 5 && local.minute < 17 * 60) ||
      (local.weekday === 0 && local.minute >= 18 * 60);
    if (
      trading &&
      !(
        instrument.assetClass === "commodity" &&
        local.minute >= 17 * 60 &&
        local.minute < 18 * 60
      )
    )
      return {
        status: age <= 30 * 60_000 ? "fresh" : "stale",
        reason: "거래 시간 중 · 기준 시각 30분 이내 (정규 휴장일 미반영)",
        marketState: "open",
      };
    const expectedDay =
      local.weekday === 6
        ? previousWeekday(local.day)
        : local.weekday === 0
          ? previousWeekday(local.day)
          : local.day;
    return {
      status:
        observed.day >= expectedDay && age <= 80 * 3_600_000
          ? "fresh"
          : "stale",
      reason: "비거래 시간 · 직전 거래일 관측값 기준 (공휴일 미반영)",
      marketState: "closed",
    };
  }
  const open = instrument.region === "KR" ? 9 * 60 : 9 * 60 + 30;
  const close = instrument.region === "KR" ? 15 * 60 + 30 : 16 * 60;
  const marketOpen = weekday && local.minute >= open && local.minute < close;
  if (marketOpen)
    return {
      status: age <= 30 * 60_000 ? "fresh" : "stale",
      reason: "정규장 중 · 기준 시각 30분 이내 (공휴일 미반영)",
      marketState: "open",
    };
  const expectedDay =
    weekday && local.minute >= close ? local.day : previousWeekday(local.day);
  return {
    status:
      observed.day >= expectedDay && observed.minute >= close - 30
        ? "fresh"
        : "stale",
    reason: `정규장 마감 · ${expectedDay} 종가 기준 (공휴일 미반영)`,
    marketState: weekday && local.minute < open ? "pre" : "closed",
  };
}

export function revalidatePoint(
  point: MarketPoint,
  instrument: InstrumentDefinition,
  now = new Date(),
): MarketPoint {
  const assessment = assessFreshness(instrument, point.asOf, point.value, now);
  // Cached fallbacks stay stale until a successful provider observation replaces them.
  const fallback = point.freshnessReason?.startsWith("수집 실패") ?? false;
  return {
    ...point,
    marketState: assessment.marketState,
    status: fallback && point.value !== null ? "stale" : assessment.status,
    freshnessReason: fallback ? point.freshnessReason : assessment.reason,
  };
}
