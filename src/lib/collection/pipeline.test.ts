// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStore, newId, validateWatchlist } from "../storage/store";
import {
  coreInstruments,
  defaultWatchlist,
  collectionInstruments,
} from "../market-data/instruments";
import { makePoint } from "../market-data/normalize";
import type { MarketDataProvider } from "../market-data/providers";
import { runCollection, prepareCollection } from "./pipeline";
import { fixtureSnapshot } from "./fixtures";
import { assessQuality } from "./quality";
import { localMutationError } from "./api";
import { getDeskState } from "./state";

const directories: string[] = [];
async function temporaryStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mybloomberg-test-"));
  directories.push(directory);
  return new LocalStore(directory);
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (
      !path
        .resolve(directory)
        .startsWith(path.join(os.tmpdir(), "mybloomberg-test-"))
    )
      throw new Error("Unexpected cleanup target");
    await rm(directory, { recursive: true, force: true });
  }
});
const healthy: MarketDataProvider = {
  getPoint: async (instrument, now) =>
    makePoint(
      instrument,
      {
        value: 100,
        change: 1,
        changePercent: 1,
        asOf: now.toISOString(),
        source: "TEST",
      },
      now,
    ),
};
const broken: MarketDataProvider = {
  getPoint: async () => {
    throw new Error("simulated outage");
  },
};
const noNews = async (now: Date) => ({
  news: [],
  sources: [
    {
      id: "test-news",
      label: "Test News",
      kind: "news" as const,
      status: "error" as const,
      count: 0,
      checkedAt: now.toISOString(),
      message: "outage",
    },
  ],
});

describe("local pipeline", () => {
  it("runs the full sample collection without external providers", async () => {
    const store = await temporaryStore();
    const noCall = vi.fn();
    const run = await runCollection("sample", { store, news: noCall });
    expect(run.stage).toBe("completed");
    expect(noCall).not.toHaveBeenCalled();
    const latest = await store.getLatest();
    expect(latest?.mode).toBe("sample");
    expect(latest?.marketPoints).toHaveLength(
      collectionInstruments(defaultWatchlist).length,
    );
    expect(await store.getLatest("live")).toBeNull();
    expect(await store.listSnapshots()).toHaveLength(1);
  });
  it("serializes simultaneous runs across store instances", async () => {
    const store = await temporaryStore();
    const first = await prepareCollection("sample", { store });
    const second = await prepareCollection("live", {
      store: new LocalStore(store.root),
    });
    expect(second.execute).toBeNull();
    expect(second.run.id).toBe(first.run.id);
    await first.execute!();
    const third = await prepareCollection("sample", { store });
    expect(third.execute).toBeTypeOf("function");
    await third.execute!();
  });
  it("preserves a valid live cache, with original timestamps, on partial provider failure", async () => {
    const store = await temporaryStore();
    await runCollection("live", {
      store,
      yahoo: healthy,
      rates: healthy,
      news: noNews,
    });
    const first = await store.getLatest("live");
    await runCollection("sample", { store });
    await runCollection("live", {
      store,
      yahoo: broken,
      rates: healthy,
      news: noNews,
    });
    const latest = await store.getLatest("live");
    expect(
      latest?.marketPoints.find((point) => point.id === "nasdaq")?.status,
    ).toBe("stale");
    expect(
      latest?.marketPoints.find((point) => point.id === "nasdaq")?.asOf,
    ).toBe(first?.marketPoints.find((point) => point.id === "nasdaq")?.asOf);
    expect(
      latest?.marketPoints.every(
        (point) => point.source !== "SAMPLE · 가상 데이터",
      ),
    ).toBe(true);
    expect(latest?.quality.newsStatus).toBe("unavailable");
  });
  it("does not pollute an empty live cache with sample data on a total outage", async () => {
    const store = await temporaryStore();
    await runCollection("sample", { store });
    const sample = await store.getLatest();
    const run = await runCollection("live", {
      store,
      yahoo: broken,
      rates: broken,
      news: noNews,
    });
    expect(run.stage).toBe("failed");
    expect(await store.getLatest("live")).toBeNull();
    expect((await store.getLatest())?.id).toBe(sample?.id);
    expect(
      (await store.getSnapshot(run.snapshotId!))?.marketPoints.every(
        (point) => point.value === null,
      ),
    ).toBe(true);
  });
  it("preserves the latest pointer after a storage failure and releases the lock", async () => {
    const store = await temporaryStore();
    await runCollection("sample", { store });
    const old = await store.getLatest();
    const save = vi
      .spyOn(store, "saveSnapshot")
      .mockRejectedValueOnce(new Error("disk full"));
    expect((await runCollection("sample", { store })).stage).toBe("failed");
    expect((await store.getLatest())?.id).toBe(old?.id);
    save.mockRestore();
    expect((await runCollection("sample", { store })).stage).toBe("completed");
  });
  it("rejects path traversal and refuses to overwrite immutable snapshots", async () => {
    const store = await temporaryStore();
    await expect(store.getSnapshot("../../.env.local")).rejects.toThrow();
    const snapshot = fixtureSnapshot(
      newId(),
      [...coreInstruments, ...defaultWatchlist],
      new Date(),
    );
    await store.saveSnapshot(snapshot);
    await expect(store.saveSnapshot(snapshot)).rejects.toThrow();
    expect(
      JSON.parse(await readFile(path.join(store.root, "latest.json"), "utf8"))
        .id,
    ).toBe(snapshot.id);
  });
  it("blocks report eligibility when two core data groups are missing", () => {
    const snapshot = fixtureSnapshot(newId(), coreInstruments, new Date());
    const missing = snapshot.marketPoints.map((point) =>
      ["sp500", "nasdaq", "dow", "usdkrw"].includes(point.id)
        ? { ...point, value: null, status: "missing" as const }
        : point,
    );
    expect(assessQuality(missing, snapshot.sources).readyForReport).toBe(false);
  });
  it("re-evaluates cached live freshness as wall time advances", async () => {
    const store = await temporaryStore();
    await runCollection("live", {
      store,
      yahoo: healthy,
      rates: healthy,
      news: noNews,
    });
    const state = await getDeskState(
      store,
      new Date(Date.now() + 10 * 86_400_000),
    );
    expect(state.snapshot?.quality.stale).toBe(
      collectionInstruments(defaultWatchlist).length,
    );
  });
});

describe("configuration and local API protection", () => {
  it("validates and persists an empty or custom watchlist", async () => {
    const store = await temporaryStore();
    await store.setWatchlist([
      { symbol: "aapl", label: "Apple", region: "US" },
    ]);
    expect((await store.getWatchlist())[0].symbol).toBe("AAPL");
    expect(validateWatchlist([])).toEqual([]);
    expect(() =>
      validateWatchlist([{ symbol: "005930", label: "삼성", region: "KR" }]),
    ).toThrow();
    expect(() =>
      validateWatchlist([
        { symbol: "NVDA", label: "Nvidia", region: "US" },
        { symbol: "nvda", label: "Duplicate", region: "US" },
      ]),
    ).toThrow();
  });
  it("rejects cross-origin writes and accepts same-origin local requests", () => {
    const request = (origin: string) =>
      new Request("http://127.0.0.1:3000/api/collect", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: '{"mode":"sample"}',
      });
    expect(
      localMutationError(request("https://attacker.example"))?.status,
    ).toBe(403);
    expect(localMutationError(request("http://127.0.0.1:3000"))).toBeNull();
    expect(
      localMutationError(
        new Request("http://localhost:3000/api/collect", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin: "http://127.0.0.1:3000",
            "Content-Type": "application/json",
          },
        }),
      ),
    ).toBeNull();
    expect(
      localMutationError(
        new Request("http://localhost:3000/api/collect", {
          method: "POST",
          headers: {
            host: "attacker.example",
            origin: "http://attacker.example",
            "Content-Type": "application/json",
          },
        }),
      )?.status,
    ).toBe(403);
  });
});
