import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CollectionSnapshot,
  DeskCollectionState,
} from "@/lib/domain/collection";
import { CollectionDesk } from "./CollectionDesk";

const snapshot: CollectionSnapshot = {
  schemaVersion: 1,
  id: "sample-1",
  collectedAt: "2026-10-18T00:00:00Z",
  mode: "sample",
  marketPoints: [],
  news: [],
  sources: [],
  quality: {
    fresh: 0,
    stale: 0,
    missing: 0,
    newsStatus: "ok",
    readyForReport: false,
    missingCritical: [],
    warnings: [],
  },
};
const initial: DeskCollectionState = {
  snapshot: null,
  run: null,
  history: [],
  config: { fredConfigured: false, watchlist: [] },
};
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CollectionDesk", () => {
  it("returns to the top of the working view when switching desktop or mobile tabs", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ...initial, snapshot })),
    );
    render(<CollectionDesk />);
    await screen.findByText("SAMPLE DATA");
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "데스크 탐색" })).getByRole(
        "button",
        { name: "종목·ETF" },
      ),
    );
    expect(scroll).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "종목·ETF" }),
    ).toBeTruthy();
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "모바일 데스크 탐색" }),
      ).getByRole("button", { name: "뉴스" }),
    );
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("heading", { level: 1, name: "뉴스" }),
    ).toBeTruthy();
    expect(document.activeElement?.id).toBe("collection-content");
  });
  it("starts empty, makes sample collection explicit, and labels every preview as sample", async () => {
    let collected = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/collect") {
        collected = true;
        expect(JSON.parse(options!.body as string)).toEqual({ mode: "sample" });
        return response({
          run: {
            id: "run1",
            mode: "sample",
            stage: "completed",
            startedAt: snapshot.collectedAt,
            finishedAt: snapshot.collectedAt,
            snapshotId: snapshot.id,
            error: null,
          },
        });
      }
      return response(collected ? { ...initial, snapshot } : initial);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CollectionDesk />);
    await screen.findByRole("button", { name: /첫 시장 데이터 수집/ });
    expect(screen.queryByText("실제 시장 데이터가 아닙니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /먼저 샘플 둘러보기/ }));
    await screen.findByText("실제 시장 데이터가 아닙니다.");
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/collect"),
    ).toHaveLength(1);
    expect(screen.getByText("SAMPLE DATA")).toBeTruthy();
  });

  it("preserves the displayed snapshot when collection cannot start and shows retry feedback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/collect"
          ? response({ error: "다른 수집이 진행 중입니다." }, false)
          : response({ ...initial, snapshot }),
      ),
    );
    render(<CollectionDesk />);
    await screen.findByText("SAMPLE DATA");
    fireEvent.click(screen.getByRole("button", { name: "시장 데이터 수집" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "다른 수집이 진행 중",
      ),
    );
    expect(screen.getByText("실제 시장 데이터가 아닙니다.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "시장 데이터 수집" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("opens a persisted archive and offers a return to the latest snapshot", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const archive = {
      ...snapshot,
      id: "old-live",
      mode: "live" as const,
      collectedAt: "2026-10-17T00:00:00Z",
    };
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/snapshots")
          ? response(archive)
          : response({
              ...initial,
              snapshot,
              history: [
                {
                  id: archive.id,
                  collectedAt: archive.collectedAt,
                  mode: "live",
                  fresh: 15,
                  stale: 0,
                  missing: 0,
                  newsCount: 0,
                  readyForReport: true,
                },
              ],
            }),
      ),
    );
    render(<CollectionDesk />);
    await screen.findByText("SAMPLE DATA");
    const nav = screen.getByRole("navigation", { name: "데스크 탐색" });
    fireEvent.click(within(nav).getByRole("button", { name: "아카이브" }));
    fireEvent.click(screen.getByRole("button", { name: /스냅샷 열기/ }));
    await screen.findByText("보관본 열람");
    expect(screen.queryByText("SAMPLE DATA")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /최신 데이터로/ }));
    expect(screen.getByText("SAMPLE DATA")).toBeTruthy();
    expect(screen.queryByText("보관본 열람")).toBeNull();
  });
});
