import type {
  CollectionMode,
  CollectionRun,
  CollectionSnapshot,
  InstrumentDefinition,
  SourceHealth,
} from "../domain/collection";
import type { MarketPoint } from "../domain/market";
import { collectionInstruments } from "../market-data/instruments";
import {
  FredRateProvider,
  TreasuryRateProvider,
  YahooMarketProvider,
  type MarketDataProvider,
} from "../market-data/providers";
import { makePoint } from "../market-data/normalize";
import { collectNews } from "../news/providers";
import { LocalStore, newId } from "../storage/store";
import { fixtureSnapshot } from "./fixtures";
import { assessQuality } from "./quality";
import { analyzeSnapshot } from "../scoring/analyze";

interface PipelineOptions {
  store?: LocalStore;
  now?: Date;
  yahoo?: MarketDataProvider;
  rates?: MarketDataProvider;
  news?: typeof collectNews;
  onError?: (error: unknown) => void;
}

async function collectMarket(
  instruments: InstrumentDefinition[],
  previous: CollectionSnapshot | null,
  now: Date,
  options: PipelineOptions,
) {
  const yahoo = options.yahoo ?? new YahooMarketProvider();
  const rates =
    options.rates ??
    (process.env.FRED_API_KEY?.trim()
      ? new FredRateProvider(process.env.FRED_API_KEY.trim())
      : new TreasuryRateProvider());
  const values: MarketPoint[] = [];
  await yahoo.prepare?.(instruments);
  const health = new Map<
    string,
    { total: number; successful: number; label: string }
  >();
  // Limit parallel requests rather than launching 30 symbols against the provider at once.
  let cursor = 0;
  const work = async () => {
    while (cursor < instruments.length) {
      const instrument = instruments[cursor++];
      const isRate = instrument.assetClass === "rate";
      const providerId = isRate
        ? process.env.FRED_API_KEY?.trim()
          ? "fred"
          : "treasury"
        : "yahoo";
      const label =
        providerId === "fred"
          ? "FRED"
          : providerId === "treasury"
            ? "U.S. Treasury"
            : "Yahoo Finance";
      const group = health.get(providerId) ?? {
        total: 0,
        successful: 0,
        label,
      };
      group.total++;
      health.set(providerId, group);
      try {
        const point = await (isRate ? rates : yahoo).getPoint(instrument, now);
        if (point.value === null) throw new Error("Missing observation");
        group.successful++;
        values.push(point);
      } catch {
        const cached = previous?.marketPoints.find(
          (point) => point.symbol === instrument.symbol && point.value !== null,
        );
        values.push(
          cached
            ? {
                ...cached,
                id: instrument.id,
                label: instrument.label,
                status: "stale",
                freshnessReason:
                  "수집 실패 · 마지막 정상 관측값을 표시합니다. 기준 시각을 확인하세요.",
              }
            : {
                ...makePoint(
                  instrument,
                  { value: null, asOf: null, source: label },
                  now,
                ),
                freshnessReason:
                  "재시도 후 수집 실패 · 저장된 정상값이 없습니다.",
              },
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, instruments.length) }, work),
  );
  const sources: SourceHealth[] = [...health].map(([id, result]) => ({
    id,
    label: result.label,
    kind: "market",
    status: result.successful === result.total ? "ok" : "error",
    count: result.successful,
    checkedAt: now.toISOString(),
    message:
      result.successful === result.total
        ? `${result.successful}개 관측값 수집`
        : `${result.total}개 중 ${result.total - result.successful}개 수집 실패 · 이전 정상값 또는 누락 표시`,
  }));
  return {
    marketPoints: instruments.map((definition) =>
      values.find((point) => point.id === definition.id)!,
    ),
    sources,
  };
}

export async function prepareCollection(
  mode: CollectionMode,
  options: PipelineOptions = {},
): Promise<{
  run: CollectionRun;
  execute: (() => Promise<CollectionRun>) | null;
}> {
  const store = options.store ?? new LocalStore();
  const release = await store.acquireLock();
  if (!release) {
    const active = await store.getRun();
    if (!active)
      throw new Error("다른 수집을 시작하고 있습니다. 잠시 후 확인하세요.");
    return { run: active, execute: null };
  }
  const now = options.now ?? new Date();
  let run: CollectionRun = {
    id: newId(now),
    mode,
    stage: "collecting",
    startedAt: now.toISOString(),
    finishedAt: null,
    snapshotId: null,
    error: null,
  };
  try {
    await store.saveRun(run);
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
      const update = async (changes: Partial<CollectionRun>) => {
        run = { ...run, ...changes };
        await store.saveRun(run);
      };
      try {
        const instruments = collectionInstruments(await store.getWatchlist());
        let snapshot: CollectionSnapshot;
        if (mode === "sample") {
          snapshot = fixtureSnapshot(run.id, instruments, now);
        } else {
          const previous = await store.getLatest("live");
          const [market, news] = await Promise.all([
            collectMarket(instruments, previous, now, options),
            (options.news ?? collectNews)(now),
          ]);
          const sources = [...market.sources, ...news.sources];
          snapshot = {
            schemaVersion: 1,
            id: run.id,
            collectedAt: now.toISOString(),
            mode,
            marketPoints: market.marketPoints,
            news: news.news,
            sources,
            quality: assessQuality(market.marketPoints, sources),
          };
        }
        snapshot.screening = analyzeSnapshot(snapshot);
        await update({ stage: "validating" });
        if (
          snapshot.marketPoints.some(
            (point) => point.value !== null && !Number.isFinite(point.value),
          )
        )
          throw new Error("Invalid normalized quote");
        await update({ stage: "saving" });
        const totalFailure =
          snapshot.marketPoints.every((point) => point.value === null) &&
          snapshot.sources.every((source) => source.status !== "ok");
        await store.saveSnapshot(snapshot, !totalFailure);
        await update({
          stage: totalFailure ? "failed" : "completed",
          snapshotId: snapshot.id,
          finishedAt: new Date().toISOString(),
          error: totalFailure
            ? "모든 데이터 소스 수집에 실패했습니다. 이전 스냅샷은 보존했습니다. 연결 상태를 확인하고 다시 시도하세요."
            : null,
        });
      } catch (error) {
        options.onError?.(error);
        await update({
          stage: "failed",
          finishedAt: new Date().toISOString(),
          error:
            "수집을 완료하지 못했습니다. 로컬 data 폴더의 설정·저장 공간과 네트워크를 확인하세요. 이전 스냅샷은 보존했습니다.",
        });
      } finally {
        await release();
      }
      return run;
    },
  };
}

export async function runCollection(
  mode: CollectionMode,
  options: PipelineOptions = {},
) {
  const prepared = await prepareCollection(mode, options);
  return prepared.execute ? prepared.execute() : prepared.run;
}
