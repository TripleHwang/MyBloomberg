import { z } from "zod";
import type { CollectionSnapshot } from "../domain/collection";

const text = z.string().trim().min(1).max(2000);
const references = z.array(z.string().min(1).max(150)).min(1).max(12);
export const briefingOutputSchema = z
  .object({
    headline: text.max(150),
    summary: text.max(4000),
    marketView: z
      .array(
        z
          .object({
            title: text.max(100),
            interpretation: text,
            evidenceIds: references,
          })
          .strict(),
      )
      .min(1)
      .max(6),
    candidates: z
      .array(
        z
          .object({
            symbol: z.string().min(1).max(40),
            action: z.enum(["buy", "sell", "watch"]),
            thesis: text,
            reasons: z.array(text).min(1).max(5),
            risks: z.array(text).min(1).max(5),
            entryCondition: text,
            exitCondition: text,
            invalidation: text,
            evidenceIds: references,
          })
          .strict(),
      )
      .max(12),
    koreaImplications: text,
    currencyView: text,
    limitations: z.array(text).min(1).max(10),
  })
  .strict();
export type BriefingOutput = z.infer<typeof briefingOutputSchema>;
export const briefingJsonSchema = z.toJSONSchema(briefingOutputSchema);

export function validateBriefingOutput(
  value: unknown,
  snapshot: CollectionSnapshot,
  evidenceIds: Set<string>,
): BriefingOutput {
  const result = briefingOutputSchema.parse(value);
  const known = new Map(
    snapshot.marketPoints.map((point) => [point.symbol, point]),
  );
  const seen = new Set<string>();
  for (const view of result.marketView)
    for (const id of view.evidenceIds)
      if (!evidenceIds.has(id))
        throw new Error("분석의 근거 식별자가 입력에 없습니다.");
  for (const candidate of result.candidates) {
    const point = known.get(candidate.symbol);
    if (!point || point.assetClass !== "equity")
      throw new Error(
        "입력에 없는 종목 또는 매매 후보로 지원하지 않는 자산입니다.",
      );
    if (seen.has(candidate.symbol))
      throw new Error("같은 종목을 상충하는 후보로 중복 기재했습니다.");
    seen.add(candidate.symbol);
    for (const id of candidate.evidenceIds)
      if (!evidenceIds.has(id))
        throw new Error("후보의 근거 식별자가 입력에 없습니다.");
    const ownQuote = candidate.evidenceIds.includes(`quote:${point.id}`);
    const ownFundamental = candidate.evidenceIds.some((id) =>
      id.startsWith(`fund:${point.id}:`),
    );
    if (!ownQuote && !ownFundamental)
      throw new Error("해당 종목의 시세 또는 재무 근거가 필요합니다.");
    if (candidate.action !== "watch") {
      if (!ownQuote)
        throw new Error("매매 후보에는 해당 종목의 시세 근거가 필요합니다.");
      if (point.status !== "fresh" || point.value === null)
        throw new Error(
          "지연 또는 누락된 시세로 매매 후보를 만들 수 없습니다.",
        );
      if (point.fundamentals?.status !== "fresh")
        throw new Error(
          "중장기 매매 후보에 사용할 최신 재무·ETF 자료가 부족합니다.",
        );
      if (!ownFundamental)
        throw new Error(
          "중장기 매매 후보에는 해당 종목의 재무 근거가 필요합니다.",
        );
      if (point.instrumentType !== "etf" && !point.fundamentals?.periodEnd)
        throw new Error("주식 실적 기준일을 확인할 수 없습니다.");
    }
  }
  return result;
}
