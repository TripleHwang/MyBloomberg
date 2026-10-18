// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStore, newId } from "../storage/store";
import {
  coreInstruments,
  defaultWatchlist,
  collectionInstruments,
} from "../market-data/instruments";
import { fixtureSnapshot } from "../collection/fixtures";
import { runBriefing, prepareBriefing, getBriefingState } from "./service";
import { BriefingStore, briefingMarkdown } from "./storage";
import { buildBriefingInput } from "./input";
import { validateBriefingOutput, type BriefingOutput } from "./schema";
import { assertNumericalGrounding } from "./grounding";
import type { CollectionSnapshot } from "../domain/collection";

const directories: string[] = [];
async function setup(mode: "live" | "sample" = "live") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "mybloomberg-report-test-"),
  );
  directories.push(root);
  const store = new LocalStore(root),
    reports = new BriefingStore(root);
  const snapshot = {
    ...fixtureSnapshot(
      newId(),
      [...coreInstruments, ...defaultWatchlist],
      new Date(),
    ),
    mode,
  };
  await store.saveSnapshot(snapshot);
  return { store, reports, snapshot };
}
afterEach(async () => {
  for (const root of directories.splice(0))
    if (
      path
        .resolve(root)
        .startsWith(path.join(os.tmpdir(), "mybloomberg-report-test-"))
    )
      await rm(root, { recursive: true, force: true });
});

function outputFor(snapshot: CollectionSnapshot): BriefingOutput {
  const stock = snapshot.marketPoints.find(
    (point) => point.assetClass === "equity",
  )!;
  return {
    headline: "근거 기반 중장기 점검",
    summary: "가격 변동과 기업의 실적 기준을 구분해 판단합니다.",
    marketView: [
      {
        title: "환율",
        interpretation:
          "환율은 원화 투자자의 보유 자산 평가에 영향을 줄 수 있습니다.",
        evidenceIds: ["quote:usdkrw"],
      },
    ],
    candidates: [
      {
        symbol: stock.symbol,
        action: "buy",
        thesis: "실적과 밸류에이션을 함께 확인할 조건부 후보입니다.",
        reasons: ["제공된 실적 근거를 확인합니다."],
        risks: ["성장 둔화 가능성을 재점검해야 합니다."],
        entryCondition: "다음 실적에서 성장 유지 여부 확인",
        exitCondition: "수익성 악화 시 재검토",
        invalidation: "원래 근거가 소멸하면 평가 보류",
        evidenceIds: [`quote:${stock.id}`, `fund:${stock.id}:revenueGrowth`],
      },
    ],
    koreaImplications: "환노출과 한국 기업 실적을 함께 살펴봅니다.",
    currencyView: "통화쌍의 기준 단위를 구분합니다.",
    limitations: ["개인 보유 종목 정보는 입력되지 않았습니다."],
  };
}

describe("expanded collection universe", () => {
  it("covers Korean/US stocks, ETFs and international currencies without duplicate symbols", () => {
    const definitions = collectionInstruments(defaultWatchlist);
    expect(definitions.length).toBeGreaterThanOrEqual(100);
    expect(new Set(definitions.map((item) => item.symbol)).size).toBe(
      definitions.length,
    );
    expect(definitions.filter((item) => item.isWatchlist)).toHaveLength(4);
    expect(
      definitions.filter((item) => item.assetClass === "fx").length,
    ).toBeGreaterThanOrEqual(20);
    expect(
      definitions.some(
        (item) => item.region === "KR" && item.instrumentType === "etf",
      ),
    ).toBe(true);
    expect(
      definitions.some(
        (item) => item.region === "US" && item.instrumentType === "stock",
      ),
    ).toBe(true);
  });
});

describe("grounded briefing validation", () => {
  it("rejects absent references, unknown symbols and stale or unfunded trade candidates", async () => {
    const { snapshot } = await setup();
    const { evidence } = buildBriefingInput(snapshot);
    const allowed = new Set(evidence.map((item) => item.id));
    const valid = outputFor(snapshot);
    expect(
      validateBriefingOutput(valid, snapshot, allowed).candidates,
    ).toHaveLength(1);
    expect(() =>
      validateBriefingOutput(
        {
          ...valid,
          candidates: [{ ...valid.candidates[0], symbol: "NOT-IN-INPUT" }],
        },
        snapshot,
        allowed,
      ),
    ).toThrow();
    expect(() =>
      validateBriefingOutput(
        {
          ...valid,
          marketView: [{ ...valid.marketView[0], evidenceIds: ["made-up"] }],
        },
        snapshot,
        allowed,
      ),
    ).toThrow();
    const stock = snapshot.marketPoints.find(
      (point) => point.assetClass === "equity",
    )!;
    stock.status = "stale";
    expect(() => validateBriefingOutput(valid, snapshot, allowed)).toThrow();
    stock.status = "fresh";
    stock.fundamentals!.status = "missing";
    expect(() => validateBriefingOutput(valid, snapshot, allowed)).toThrow();
  });
  it("rejects ungrounded numerical price targets and ties candidate figures to cited evidence", async () => {
    const { snapshot } = await setup();
    const { evidence } = buildBriefingInput(snapshot);
    const valid = outputFor(snapshot);
    expect(() =>
      assertNumericalGrounding(valid, snapshot, evidence),
    ).not.toThrow();
    valid.candidates[0].entryCondition = "주가 123456.789에서 매수";
    expect(() => assertNumericalGrounding(valid, snapshot, evidence)).toThrow();
  });
  it("requires the exact candidate quote and never matches a longer symbol prefix", async () => {
    const { snapshot } = await setup();
    const valid = outputFor(snapshot);
    const stock = snapshot.marketPoints.find(
      (point) => point.assetClass === "equity",
    )!;
    const { evidence } = buildBriefingInput(snapshot);
    const allowed = new Set(evidence.map((item) => item.id));
    valid.candidates[0].evidenceIds = [`fund:${stock.id}:revenueGrowth`];
    expect(() => validateBriefingOutput(valid, snapshot, allowed)).toThrow(
      /시세 근거/,
    );
    valid.candidates[0].action = "watch";
    valid.candidates[0].evidenceIds = [`quote:${stock.id}-OTHER`];
    allowed.add(`quote:${stock.id}-OTHER`);
    expect(() => validateBriefingOutput(valid, snapshot, allowed)).toThrow(
      /해당 종목/,
    );
  });
});

describe("briefing execution and persistence", () => {
  it("keeps candidates, rules and scores identical even when Codex returns conflicting candidates", async () => {
    const { store, reports, snapshot } = await setup();
    const original = outputFor(snapshot);
    const generator = { generate: async () => original };
    expect(
      (
        await runBriefing(snapshot.id, {
          store,
          reportStore: reports,
          generator,
        })
      ).stage,
    ).toBe("completed");
    const first = await reports.getForSnapshot(snapshot.id);
    original.candidates[0].symbol = "MADE-UP";
    original.candidates[0].action = "sell";
    original.candidates[0].thesis = "AI가 고른 주가 123456.789 후보";
    expect(
      (
        await runBriefing(snapshot.id, {
          store,
          reportStore: reports,
          generator,
        })
      ).stage,
    ).toBe("completed");
    const second = await reports.getForSnapshot(snapshot.id);
    expect(second?.candidates).toEqual(first?.candidates);
    expect(second?.screening?.inputHash).toBe(first?.screening?.inputHash);
    expect(second?.candidates.some((item) => item.symbol === "MADE-UP")).toBe(
      false,
    );
    expect(second?.screening?.modelVersion).toBe("balanced-1.1.0");
  });
  it("produces a marked sample report without invoking Codex", async () => {
    const { store, reports, snapshot } = await setup("sample");
    const generate = vi.fn();
    expect(
      (
        await runBriefing(snapshot.id, {
          store,
          reportStore: reports,
          generator: { generate },
        })
      ).stage,
    ).toBe("completed");
    expect(generate).not.toHaveBeenCalled();
    const report = await reports.getForSnapshot(snapshot.id);
    expect(report?.engine).toBe("sample");
    expect(briefingMarkdown(report!)).toContain("샘플 (가상 데이터)");
  });
  it("repairs invalid output once and persists only the validated report", async () => {
    const { store, reports, snapshot } = await setup();
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ bad: true })
      .mockResolvedValueOnce(outputFor(snapshot));
    const run = await runBriefing(snapshot.id, {
      store,
      reportStore: reports,
      generator: { generate },
    });
    expect(run.stage).toBe("completed");
    expect(generate).toHaveBeenCalledTimes(2);
    const report = await reports.getForSnapshot(snapshot.id);
    expect(report?.engine).toBe("codex");
    expect(
      report?.evidence.every((item) =>
        buildBriefingInput(snapshot).evidence.some(
          (source) => source.id === item.id,
        ),
      ),
    ).toBe(true);
  });
  it("keeps the previous success when correction fails", async () => {
    const { store, reports, snapshot } = await setup();
    await runBriefing(snapshot.id, {
      store,
      reportStore: reports,
      generator: { generate: async () => outputFor(snapshot) },
    });
    const previous = await reports.getLatest();
    const generate = vi.fn().mockResolvedValue({ invalid: true });
    expect(
      (
        await runBriefing(snapshot.id, {
          store,
          reportStore: reports,
          generator: { generate },
        })
      ).stage,
    ).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(2);
    expect((await reports.getForSnapshot(snapshot.id))?.id).toBe(previous?.id);
  });
  it("prevents concurrent Codex analyses and releases the lock", async () => {
    const { store, reports, snapshot } = await setup("sample");
    const first = await prepareBriefing(snapshot.id, {
      store,
      reportStore: reports,
    });
    const second = await prepareBriefing(snapshot.id, {
      store,
      reportStore: reports,
    });
    expect(second.execute).toBeNull();
    expect(second.run.id).toBe(first.run.id);
    await first.execute!();
    expect(
      (await runBriefing(snapshot.id, { store, reportStore: reports })).stage,
    ).toBe("completed");
  });
  it("offers explicit same-mode fallback on the live desk but exact reports for archives", async () => {
    const { store, reports, snapshot } = await setup();
    await runBriefing(snapshot.id, {
      store,
      reportStore: reports,
      generator: { generate: async () => outputFor(snapshot) },
    });
    const newer = { ...snapshot, id: newId() };
    await store.saveSnapshot(newer);
    expect(
      (await getBriefingState(newer.id, { store, reportStore: reports }))
        .report,
    ).toBeNull();
    const fallback = await getBriefingState(newer.id, {
      store,
      reportStore: reports,
      fallback: true,
    });
    expect(fallback.report?.snapshotId).toBe(snapshot.id);
    expect(fallback.matchesSnapshot).toBe(false);
    const sample = { ...snapshot, id: newId(), mode: "sample" as const };
    await store.saveSnapshot(sample);
    expect(
      (
        await getBriefingState(sample.id, {
          store,
          reportStore: reports,
          fallback: true,
        })
      ).report,
    ).toBeNull();
  });
});
