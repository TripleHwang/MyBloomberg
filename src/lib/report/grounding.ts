import type { BriefingEvidence } from "../domain/briefing";
import type { CollectionSnapshot } from "../domain/collection";
import type { BriefingOutput } from "./schema";

function numbers(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter(Number.isFinite);
}
function allowedNumbers(text: string) {
  const allowed = new Set<string>();
  for (const value of numbers(text))
    for (const precision of [0, 1, 2, 3, 4, 6])
      allowed.add(Number(value.toFixed(precision)).toString());
  return allowed;
}

// This catches new numerical claims/price targets; evidence references and eligibility are checked separately.
export function assertNumericalGrounding(
  output: BriefingOutput,
  snapshot: CollectionSnapshot,
  evidence: BriefingEvidence[],
) {
  const context = `${snapshot.collectedAt} ${snapshot.marketPoints.length} 최근 24시간 1년 2년 10년 52주 100% ${snapshot.marketPoints.map((point) => `${point.symbol} ${point.label}`).join(" ")}`;
  const check = (texts: string[], selected: BriefingEvidence[]) => {
    const allowed = allowedNumbers(
      `${context} ${selected.map((item) => `${item.label} ${item.value} ${item.asOf ?? ""}`).join(" ")}`,
    );
    const invalid = texts
      .flatMap(numbers)
      .find((number) => !allowed.has(number.toString()));
    if (invalid !== undefined)
      throw new Error(
        `입력 근거에서 확인할 수 없는 수치 또는 가격 목표(${invalid})가 포함되었습니다.`,
      );
  };
  check(
    [
      output.headline,
      output.summary,
      output.koreaImplications,
      output.currencyView,
      ...output.limitations,
    ],
    evidence,
  );
  for (const view of output.marketView)
    check(
      [view.title, view.interpretation],
      evidence.filter((item) => view.evidenceIds.includes(item.id)),
    );
  for (const candidate of output.candidates)
    check(
      [
        candidate.thesis,
        ...candidate.reasons,
        ...candidate.risks,
        candidate.entryCondition,
        candidate.exitCondition,
        candidate.invalidation,
      ],
      evidence.filter((item) => candidate.evidenceIds.includes(item.id)),
    );
}
