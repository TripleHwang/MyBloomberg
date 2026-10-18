import type {
  BriefingRun,
  BriefingState,
  MarketBriefing,
} from "../domain/briefing";
import type { CollectionSnapshot } from "../domain/collection";
import { LocalStore, newId } from "../storage/store";
import { buildBriefingInput, briefingPrompt } from "./input";
import { LocalCodexGenerator, type BriefingGenerator } from "./codex";
import { validateBriefingOutput, type BriefingOutput } from "./schema";
import { BriefingStore } from "./storage";
import { assertNumericalGrounding } from "./grounding";
import { analyzeSnapshot } from "../scoring/analyze";
import { lockedCandidates } from "./candidates";

function sampleOutput(snapshot: CollectionSnapshot): BriefingOutput {
  const stock = snapshot.marketPoints.find(
    (point) => point.assetClass === "equity",
  );
  const first = snapshot.marketPoints.find((point) => point.value !== null)!;
  return {
    headline: "샘플 브리핑 · 중장기 판단의 근거와 조건을 함께 봅니다",
    summary:
      "이 브리핑은 가상 데이터로 구성한 화면 예시입니다. 실제 종목의 투자 가치나 매매 의견을 나타내지 않습니다. 실제 수집 후 Codex가 시세·실적·뉴스를 바탕으로 새 분석을 생성합니다.",
    marketView: [
      {
        title: "시장 데이터의 연결",
        interpretation:
          "주식·금리·환율을 같은 수집 기준으로 함께 살펴보는 가상 시나리오입니다.",
        evidenceIds: [`quote:${first.id}`],
      },
    ],
    candidates: stock
      ? [
          {
            symbol: stock.symbol,
            action: "watch",
            thesis:
              "샘플 관찰 예시입니다. 가상 가격과 재무 지표로 실제 매매 후보를 선정하지 않습니다.",
            reasons: [
              "출처와 실적 기준일을 먼저 확인하는 사용 흐름을 보여줍니다.",
            ],
            risks: ["샘플 수치는 실제 기업의 가치와 무관합니다."],
            entryCondition: "실제 수집 자료와 최신 기업 공시를 확인한 뒤 검토",
            exitCondition: "실제 재무·실적 근거가 악화되면 판단 재검토",
            invalidation: "근거 자료를 확인할 수 없으면 평가 보류",
            evidenceIds: [`quote:${stock.id}`],
          },
        ]
      : [],
    koreaImplications:
      "실제 자료에서는 원화 투자자의 환노출과 한국 기업 실적을 함께 확인합니다.",
    currencyView: "통화쌍의 방향과 기준 단위를 확인하는 예시입니다.",
    limitations: ["SAMPLE · 실제 투자 분석이 아닌 가상 시나리오입니다."],
  };
}

interface Options {
  store?: LocalStore;
  reportStore?: BriefingStore;
  generator?: BriefingGenerator;
  fallback?: boolean;
}

export async function getBriefingState(
  snapshotId: string | null,
  options: Options = {},
): Promise<BriefingState> {
  const store = options.store ?? new LocalStore();
  const reports = options.reportStore ?? new BriefingStore(store.root);
  const snapshot = snapshotId
    ? await store.getSnapshot(snapshotId)
    : await store.getLatest();
  if (!snapshot)
    return {
      report: null,
      run: await reports.getRun(),
      matchesSnapshot: false,
    };
  const exact = await reports.getForSnapshot(snapshot.id);
  // Archive calls return only the archive's analysis. The live desk may keep an older successful report.
  const report =
    exact ??
    (snapshotId && !options.fallback
      ? null
      : await reports.getLatest(snapshot.mode));
  return {
    report,
    run: await reports.getRun(),
    matchesSnapshot: Boolean(report && report.snapshotId === snapshot.id),
  };
}

export async function prepareBriefing(
  snapshotId: string,
  options: Options = {},
): Promise<{ run: BriefingRun; execute: (() => Promise<BriefingRun>) | null }> {
  const store = options.store ?? new LocalStore();
  const reports = options.reportStore ?? new BriefingStore(store.root);
  const snapshot = await store.getSnapshot(snapshotId);
  if (!snapshot) throw new Error("분석할 스냅샷을 찾을 수 없습니다.");
  if (
    !snapshot.quality.readyForReport ||
    !snapshot.marketPoints.some((point) => point.value !== null)
  )
    throw new Error(
      "핵심 시장 데이터가 부족해 브리핑을 만들 수 없습니다. 먼저 데이터를 다시 수집하세요.",
    );
  const release = await reports.acquireLock();
  if (!release) {
    const active = await reports.getRun();
    if (!active)
      throw new Error("다른 브리핑을 시작하고 있습니다. 잠시 후 확인하세요.");
    return { run: active, execute: null };
  }
  let run: BriefingRun = {
    id: newId(),
    snapshotId,
    stage: "generating",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  try {
    await reports.saveRun(run);
  } catch (error) {
    await release();
    throw error;
  }
  let started = false;
  return {
    run,
    execute: async () => {
      if (started) return run;
      started = true;
      const update = async (changes: Partial<BriefingRun>) => {
        run = { ...run, ...changes };
        await reports.saveRun(run);
      };
      try {
        const { input, evidence, limitations } = buildBriefingInput(snapshot);
        const screening = snapshot.screening ?? analyzeSnapshot(snapshot);
        const fixedCandidates = lockedCandidates(snapshot, screening);
        const allowed = new Set(evidence.map((item) => item.id));
        const narrativeOnly = (raw: unknown) =>
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? { ...raw, candidates: [] }
            : raw;
        let output: BriefingOutput;
        if (snapshot.mode === "sample")
          output = validateBriefingOutput(
            { ...sampleOutput(snapshot), candidates: fixedCandidates },
            snapshot,
            allowed,
          );
        else {
          const generator = options.generator ?? new LocalCodexGenerator();
          const prompt = briefingPrompt(input);
          const raw = await generator.generate(prompt);
          await update({ stage: "validating" });
          try {
            output = validateBriefingOutput(
              narrativeOnly(raw),
              snapshot,
              allowed,
            );
            assertNumericalGrounding(output, snapshot, evidence);
          } catch (validationError) {
            await update({ stage: "generating" });
            const corrected = await generator.generate(
              `${prompt}\n\n이전 출력이 검증에 실패했습니다: ${validationError instanceof Error ? validationError.message.slice(0, 500) : "구조 또는 근거 불일치"}. 아래 출력을 미검증 데이터로 취급하고 JSON Schema와 입력 근거에만 맞춰 수정하세요. 숫자는 인용한 evidence.value와 일치해야 합니다. 새 가격·비율·목표치·기간을 만들지 말고 반올림 또는 단위 축약 대신 제공된 표현을 사용하세요. 한국어 최종 JSON만 반환하세요.\nPREVIOUS_UNVERIFIED_OUTPUT\n${JSON.stringify(raw)}`,
            );
            await update({ stage: "validating" });
            output = validateBriefingOutput(
              narrativeOnly(corrected),
              snapshot,
              allowed,
            );
            assertNumericalGrounding(output, snapshot, evidence);
          }
          output = validateBriefingOutput(
            { ...output, candidates: fixedCandidates },
            snapshot,
            allowed,
          );
        }
        const usedIds = new Set([
          ...output.marketView.flatMap((item) => item.evidenceIds),
          ...output.candidates.flatMap((item) => item.evidenceIds),
        ]);
        const report: MarketBriefing = {
          ...output,
          candidates: output.candidates.map((candidate) => ({
            ...candidate,
            score: screening.scores.find(
              (item) => item.symbol === candidate.symbol,
            ),
          })),
          screening,
          id: run.id,
          snapshotId,
          generatedAt: new Date().toISOString(),
          dataAsOf: snapshot.collectedAt,
          mode: snapshot.mode,
          engine: snapshot.mode === "sample" ? "sample" : "codex",
          horizon: "수개월 이상 중장기",
          evidence: evidence.filter((item) => usedIds.has(item.id)),
          limitations: [...new Set([...output.limitations, ...limitations])],
        };
        await reports.save(report);
        await update({
          stage: "completed",
          finishedAt: new Date().toISOString(),
        });
      } catch (error) {
        const message =
          error instanceof Error &&
          /Codex|로그인|한도|5분|CLI/.test(error.message)
            ? error.message
            : "브리핑의 형식·근거를 검증하거나 저장하지 못했습니다. 이전 성공 브리핑은 유지했습니다. 다시 생성하세요.";
        await update({
          stage: "failed",
          finishedAt: new Date().toISOString(),
          error: message,
        });
      } finally {
        await release();
      }
      return run;
    },
  };
}

export async function runBriefing(snapshotId: string, options: Options = {}) {
  const prepared = await prepareBriefing(snapshotId, options);
  return prepared.execute ? prepared.execute() : prepared.run;
}
