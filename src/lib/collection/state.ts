import type {
  CollectionSnapshot,
  DeskCollectionState,
} from "../domain/collection";
import { collectionInstruments } from "../market-data/instruments";
import { revalidatePoint } from "../market-data/freshness";
import { LocalStore } from "../storage/store";
import { assessQuality } from "./quality";
import { getBriefingState } from "../report/service";

export async function getDeskState(
  store = new LocalStore(),
  now = new Date(),
): Promise<DeskCollectionState> {
  const [saved, run, history, watchlist] = await Promise.all([
    store.getLatest(),
    store.getRun(),
    store.listSnapshots(),
    store.getWatchlist(),
  ]);
  let snapshot: CollectionSnapshot | null = saved;
  if (saved?.mode === "live") {
    const instruments = collectionInstruments(watchlist);
    const marketPoints = saved.marketPoints.map((point) => {
      const definition = instruments.find(
        (item) => item.symbol === point.symbol,
      ) ?? {
        id: point.id,
        symbol: point.symbol,
        label: point.label,
        assetClass: point.assetClass,
        currency: point.currency,
        region: point.currency === "KRW" ? ("KR" as const) : ("US" as const),
        provider: "yahoo" as const,
      };
      return revalidatePoint(
        {
          ...point,
          region: definition.region,
          instrumentType: definition.instrumentType,
          sector: definition.sector,
          isWatchlist: watchlist.some((item) => item.symbol === point.symbol),
        },
        definition,
        now,
      );
    });
    snapshot = {
      ...saved,
      marketPoints,
      quality: assessQuality(marketPoints, saved.sources),
    };
  }
  return {
    briefing: await getBriefingState(null, { store }),
    universeCount: collectionInstruments(watchlist).length,
    snapshot,
    run,
    history,
    config: {
      fredConfigured: Boolean(process.env.FRED_API_KEY?.trim()),
      watchlist,
    },
  };
}
