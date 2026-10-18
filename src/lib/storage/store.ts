import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type {
  CollectionMode,
  CollectionRun,
  CollectionSnapshot,
  InstrumentDefinition,
  SnapshotSummary,
} from "../domain/collection";
import { defaultWatchlist } from "../market-data/instruments";
import { zonedParts } from "../market-data/freshness";

const idPattern = /^\d{4}-\d{2}-\d{2}_\d{9}_[a-f0-9]{8}$/;
export function newId(now = new Date()): string {
  const day = zonedParts(now, "Asia/Seoul").day;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .replace(/:/g, "");
  return `${day}_${time}${String(now.getUTCMilliseconds()).padStart(3, "0")}_${randomBytes(4).toString("hex")}`;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export class LocalStore {
  constructor(
    readonly root = process.env.MYBLOOMBERG_DATA_DIR ||
      path.join(process.cwd(), "data"),
  ) {}
  private snapshotFile(id: string) {
    if (!idPattern.test(id)) throw new Error("잘못된 스냅샷 식별자입니다.");
    return path.join(this.root, "snapshots", id.slice(0, 10), `${id}.json`);
  }
  async getSnapshot(id: string) {
    return readJson<CollectionSnapshot>(this.snapshotFile(id));
  }
  async saveSnapshot(snapshot: CollectionSnapshot, updateLatest = true) {
    // Immutable snapshots; the small pointer is committed only after the full file exists.
    const file = this.snapshotFile(snapshot.id);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    if (updateLatest) {
      await atomicJson(path.join(this.root, `latest-${snapshot.mode}.json`), {
        id: snapshot.id,
      });
      await atomicJson(path.join(this.root, "latest.json"), {
        id: snapshot.id,
      });
    }
  }
  async getLatest(mode?: CollectionMode) {
    const pointer = await readJson<{ id: string }>(
      path.join(this.root, mode ? `latest-${mode}.json` : "latest.json"),
    );
    return pointer ? this.getSnapshot(pointer.id) : null;
  }
  async listSnapshots(limit = 100): Promise<SnapshotSummary[]> {
    const base = path.join(this.root, "snapshots");
    let dates: string[];
    try {
      dates = (await readdir(base))
        .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .sort()
        .reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const summaries: SnapshotSummary[] = [];
    for (const day of dates) {
      const files = (await readdir(path.join(base, day)))
        .filter(
          (file) => file.endsWith(".json") && idPattern.test(file.slice(0, -5)),
        )
        .sort()
        .reverse();
      for (const file of files) {
        // A damaged historical file should not hide the rest of the archive.
        const snapshot = await this.getSnapshot(file.slice(0, -5)).catch(
          () => null,
        );
        if (!snapshot) continue;
        summaries.push({
          id: snapshot.id,
          collectedAt: snapshot.collectedAt,
          mode: snapshot.mode,
          fresh: snapshot.quality.fresh,
          stale: snapshot.quality.stale,
          missing: snapshot.quality.missing,
          newsCount: snapshot.news.length,
          readyForReport: snapshot.quality.readyForReport,
        });
        if (summaries.length >= limit) return summaries;
      }
    }
    return summaries;
  }
  async getWatchlist(): Promise<InstrumentDefinition[]> {
    const config = await readJson<{ watchlist: unknown }>(
      path.join(this.root, "config", "watchlist.json"),
    );
    return config ? validateWatchlist(config.watchlist) : defaultWatchlist;
  }
  async setWatchlist(input: unknown) {
    const watchlist = validateWatchlist(input);
    await atomicJson(path.join(this.root, "config", "watchlist.json"), {
      watchlist,
    });
    return watchlist;
  }
  async getRun() {
    const run = await readJson<CollectionRun>(
      path.join(this.root, "current-run.json"),
    );
    if (
      run &&
      !["completed", "failed"].includes(run.stage) &&
      Date.now() - Date.parse(run.startedAt) > 30 * 60_000
    )
      return {
        ...run,
        stage: "failed" as const,
        error: "이전 수집이 중단되었습니다. 다시 수집할 수 있습니다.",
      };
    return run;
  }
  async saveRun(run: CollectionRun) {
    await atomicJson(
      path.join(this.root, "runs", run.id.slice(0, 10), `${run.id}.json`),
      run,
    );
    await atomicJson(path.join(this.root, "current-run.json"), run);
  }
  async acquireLock(): Promise<(() => Promise<void>) | null> {
    await mkdir(this.root, { recursive: true });
    const file = path.join(this.root, ".collection.lock");
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(String(Date.now()));
      await handle.close();
      return async () => {
        await unlink(file).catch(() => {});
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = await stat(file).catch(() => null);
      if (metadata && Date.now() - metadata.mtimeMs > 30 * 60_000) {
        // Rename the stale lock before retrying; only one contender can claim it.
        const stale = `${file}.${randomBytes(4).toString("hex")}.expired`;
        try {
          await rename(file, stale);
          await unlink(stale);
        } catch {
          return null;
        }
        return this.acquireLock();
      }
      return null;
    }
  }
}

export function validateWatchlist(input: unknown): InstrumentDefinition[] {
  if (!Array.isArray(input) || input.length > 20)
    throw new Error("관심 종목은 최대 20개까지 저장할 수 있습니다.");
  const symbols = new Set<string>();
  return input.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new Error("관심 종목 형식이 올바르지 않습니다.");
    const row = entry as Record<string, unknown>;
    const symbol =
      typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const region = row.region;
    if (
      !/^[A-Z0-9][A-Z0-9.=_-]{0,24}$/.test(symbol) ||
      !label ||
      label.length > 60 ||
      !["KR", "US"].includes(String(region))
    )
      throw new Error(
        "종목 코드·이름·시장(KR/US)을 확인하세요. 한국 종목은 005930.KS 형식입니다.",
      );
    if (symbols.has(symbol))
      throw new Error(`${symbol} 종목이 중복되었습니다.`);
    if (region === "KR" && !/\.(KS|KQ)$/.test(symbol))
      throw new Error("한국 종목은 .KS 또는 .KQ 접미사를 붙여주세요.");
    symbols.add(symbol);
    return {
      id: `watch-${symbol}`,
      symbol,
      label,
      assetClass: "equity",
      currency: region === "KR" ? "KRW" : "USD",
      region: region as "KR" | "US",
      provider: "yahoo",
    };
  });
}
