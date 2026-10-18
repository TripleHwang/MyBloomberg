import type { CollectionSnapshot } from "../domain/collection";
import type { InstrumentScore, ScreeningAnalysis } from "../domain/scoring";
import type { BriefingOutput } from "./schema";

const number = (value: number | null, suffix = "") =>
  value === null ? "미확인" : `${value.toFixed(2)}${suffix}`;
const percent = (value: number | null) =>
  value === null ? "미확인" : `${(value * 100).toFixed(2)}%`;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

export function scoreEvidenceValue(score: InstrumentScore) {
  return (
    `기본 ${number(score.baseScore)}점 / 뉴스 ${signed(score.news.adjustment)}점 / 총점 ${number(score.totalScore)}점 / 자료 충족률 ${score.coverage}% / 매수 기준70·기본65 / 축소 기준40·기본45 / 최소3개 회계연도·비교2개·충족률80%. ` +
    score.components
      .map(
        (factor) =>
          `${factor.label} ${number(factor.points)}/${factor.weight}점 (${factor.metrics.map((item) => `${item.label} ${item.value === null ? "미확인" : item.unit === "percent" ? percent(item.value) : number(item.value)}: ${number(item.points)}/${item.maxPoints}점`).join("; ")})`,
      )
      .join(" / ")
  );
}
export function annualEvidenceValue(score: InstrumentScore) {
  return `${score.trend.years}개 회계연도 ${score.trend.firstPeriod ?? "미확인"}~${score.trend.lastPeriod ?? "미확인"}, 보고 통화 ${score.trend.currency ?? "미확인"}. 매출 CAGR ${percent(score.trend.revenueCagr)}, 이익 CAGR ${percent(score.trend.earningsCagr)}, 흑자 ${score.trend.positiveIncomeYears}개 연도, 양의 FCF ${score.trend.positiveFcfYears}개 연도.`;
}
export function peerEvidenceValue(score: InstrumentScore) {
  return (
    `${score.peers.groupLabel}, 본인 제외 비교 ${score.peers.count}개 (${score.peers.symbols.join(", ") || "없음"}). ` +
    score.peers.metrics
      .map(
        (item) =>
          `${item.label}: 본인 ${item.unit === "percent" ? percent(item.value) : number(item.value)}, 중앙값 ${item.unit === "percent" ? percent(item.median) : number(item.median)}, 유리한 방향 백분위 ${number(item.percentile, "%")}, 유효 비교 ${item.sampleSize}개`,
      )
      .join(" / ")
  );
}

export function lockedCandidates(
  snapshot: CollectionSnapshot,
  analysis: ScreeningAnalysis,
): BriefingOutput["candidates"] {
  return analysis.selected.flatMap((selected) => {
    const point = snapshot.marketPoints.find(
      (item) => item.symbol === selected.symbol,
    );
    const score = analysis.scores.find(
      (item) => item.symbol === selected.symbol,
    );
    if (!point || !score) return [];
    const financial = point.fundamentals;
    const keys = [
      "trailingPE",
      "priceToBook",
      "revenueGrowth",
      "freeCashflow",
      "expenseRatio",
      "marketCap",
    ] as const;
    const fundKeys = keys
      .filter((key) => typeof financial?.[key] === "number")
      .slice(0, 2);
    const thesis =
      score.totalScore === null
        ? "중장기 점수를 산출할 자료가 부족해 관찰합니다."
        : `균형형 총점 ${number(score.totalScore)}/100점(기본 ${number(score.baseScore)}, 뉴스 ${signed(score.news.adjustment)})에 따른 ${selected.action === "buy" ? "조건부 매수 검토" : selected.action === "sell" ? "보유 시 축소 검토" : "관찰"} 후보입니다.`;
    const breakdown = score.components
      .map((item) => `${item.label} ${number(item.points)}/${item.weight}`)
      .join(" · ");
    const reasons = [
      `고정 기준 평가: ${breakdown}. 자료 충족률 ${score.coverage}%.`,
      score.kind === "etf"
        ? "ETF는 기업 실적 대신 비용·가격 위험·관측 추세·동일 유형 비교를 평가합니다."
        : annualEvidenceValue(score),
      peerEvidenceValue(score),
    ];
    if (score.actionReasons?.length)
      reasons.push(score.actionReasons.join(" "));
    if (score.news.items.some((item) => item.contribution !== 0))
      reasons.push(
        `뉴스의 실제 순조정은 ${signed(score.news.adjustment)}점입니다. ${score.news.changedAction ? "이번 조정으로 후보 분류가 바뀌었습니다." : "이번 조정으로 후보 분류는 바뀌지 않았습니다."}`,
      );
    const weakest = [...score.components]
      .filter((item) => item.points !== null)
      .sort((a, b) => a.points! / a.weight - b.points! / b.weight)[0];
    const risks = [
      ...(score.blockers.length
        ? score.blockers.slice(0, 2)
        : weakest
          ? [
              `가장 낮은 평가 부문은 ${weakest.label}(${number(weakest.points)}/${weakest.weight}점)입니다. 점수 근거가 개선·악화되는지 확인해야 합니다.`,
            ]
          : ["자료가 부족해 장기 지속성을 평가할 수 없습니다."]),
      "공급자 요약·제한된 비교 집단에 근거하며 최신 공시 전문·개인 보유 비중을 검토하지 않았습니다.",
    ];
    const entryCondition =
      selected.action === "sell"
        ? "다음 공시와 같은 기준의 재평가에서도 총점 40점 이하와 실적·재무 약화가 함께 지속되면, 보유 시 축소 검토"
        : selected.action === "buy"
          ? "최신 공시에서 성장·현금창출 근거를 확인하고, 자료 요건과 총점 70점·기본 65점 이상이 유지되는지 확인한 뒤 검토"
          : "부족한 재무·비교 자료를 보완하고 같은 기준에서 총점 70점·기본 65점 및 매수 요건을 충족하는지 재평가";
    const exitCondition =
      selected.action === "sell"
        ? "실적·재무 약화 근거가 해소되거나 총점이 40점을 넘으면 기존 축소 판단을 재검토"
        : "이익·현금흐름·재무 근거가 악화되거나 총점이 40점 이하와 약화 요건을 함께 충족하면 보유 시 축소 재검토";
    const evidenceIds = [
      `quote:${point.id}`,
      ...fundKeys.map((key) => `fund:${point.id}:${key}`),
      `score:${point.id}`,
      `peer:${point.id}`,
      ...(point.fundamentals?.history ? [`annual:${point.id}`] : []),
      ...score.news.items
        .filter((item) => item.contribution !== 0)
        .slice(0, 3)
        .map((item) => item.newsId),
    ];
    return [
      {
        symbol: selected.symbol,
        action: selected.action,
        thesis,
        reasons,
        risks,
        entryCondition,
        exitCondition,
        invalidation:
          "원자료 정정·업종 분류 오류·회계기준 변화로 비교가 성립하지 않거나 원래 판단 근거가 사라지면 기존 판단을 보류",
        evidenceIds,
      },
    ];
  });
}
