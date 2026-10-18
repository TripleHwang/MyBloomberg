import type { MarketBriefing } from "../domain/briefing";

function readable(text: string) {
  return text
    .replaceAll(
      "eligibleForTradeCandidate=false",
      "중장기 매매 후보를 판단할 자료가 부족한 상태",
    )
    .replaceAll(
      "eligibleForTradeCandidate=true",
      "중장기 매매 후보 판정에 필요한 자료가 있는 상태",
    );
}

// Keep internal input field names out of saved-report presentation, including older reports.
export function presentBriefing(report: MarketBriefing): MarketBriefing {
  return {
    ...report,
    headline: readable(report.headline),
    summary: readable(report.summary),
    koreaImplications: readable(report.koreaImplications),
    currencyView: readable(report.currencyView),
    limitations: report.limitations.map(readable),
    marketView: report.marketView.map((view) => ({
      ...view,
      title: readable(view.title),
      interpretation: readable(view.interpretation),
    })),
    candidates: report.candidates.map((candidate) => ({
      ...candidate,
      thesis: readable(candidate.thesis),
      reasons: candidate.reasons.map(readable),
      risks: candidate.risks.map(readable),
      entryCondition: readable(candidate.entryCondition),
      exitCondition: readable(candidate.exitCondition),
      invalidation: readable(candidate.invalidation),
    })),
  };
}
