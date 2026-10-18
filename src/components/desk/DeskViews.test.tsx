import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketPoint } from "@/lib/domain/market";
import type { NewsItem, SourceHealth } from "@/lib/domain/collection";
import { MarketBoard, NewsFeed, SettingsView } from "./DeskViews";
import { observationTime, quoteUrl } from "./desk-utils";

const point = (
  id: string,
  label: string,
  changePercent: number | null,
  overrides: Partial<MarketPoint> = {},
): MarketPoint => ({
  id,
  label,
  symbol: id,
  assetClass: "index",
  value: 100,
  displayValue: "100.00",
  change: 1,
  changePercent,
  displayChange: `${changePercent}%`,
  direction: "up",
  currency: "USD",
  asOf: "2026-10-16T20:00:00Z",
  source: "Yahoo Finance",
  status: "fresh",
  ...overrides,
});
const points = [
  point("kospi", "KOSPI", 1),
  point("NVDA", "NVIDIA", -2, { assetClass: "equity", direction: "down" }),
  point("missing", "누락 종목", null, {
    value: null,
    status: "missing",
    displayValue: "—",
  }),
];
const source: SourceHealth = {
  id: "rss",
  label: "RSS",
  kind: "news",
  status: "ok",
  count: 0,
  checkedAt: "2026-10-18T00:00:00Z",
  message: "정상",
};

afterEach(() => vi.unstubAllGlobals());

describe("market desk interactions", () => {
  it("combines country, stock/ETF, sector and snapshot watchlist filters", () => {
    const universe = [
      point("005930.KS", "삼성전자", 1, {
        assetClass: "equity",
        region: "KR",
        instrumentType: "stock",
        sector: "기술",
        isWatchlist: true,
      }),
      point("QQQ", "Nasdaq ETF", 2, {
        assetClass: "equity",
        region: "US",
        instrumentType: "etf",
        sector: "기술",
        isWatchlist: false,
      }),
      point("JPM", "JPMorgan", 1, {
        assetClass: "equity",
        region: "US",
        instrumentType: "stock",
        sector: "금융",
        isWatchlist: false,
      }),
    ];
    render(
      <MarketBoard
        points={universe}
        scope="equity"
        onSelect={() => {}}
        watchlistSymbols={["QQQ"]}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "종목 시장" }), {
      target: { value: "KR" },
    });
    expect(
      screen.getByRole("button", { name: /삼성전자 \(005930.KS\)/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Nasdaq ETF \(QQQ\)/ }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "종목 시장" }), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "종목 종류" }), {
      target: { value: "etf" },
    });
    expect(
      screen.getByRole("button", { name: /Nasdaq ETF \(QQQ\)/ }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "종목 종류" }), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: /관심 종목 1/ }));
    expect(
      screen.getByRole("button", { name: /삼성전자 \(005930.KS\)/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Nasdaq ETF \(QQQ\)/ }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "종목 섹터" }), {
      target: { value: "금융" },
    });
    expect(screen.getByText("조건에 맞는 종목이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /검색 조건 초기화/ }));
    expect(
      screen.getByRole("button", { name: /JPMorgan \(JPM\)/ }),
    ).toBeTruthy();
  });

  it("paginates a broad universe without inaccessible inner scrolling", () => {
    render(
      <MarketBoard
        points={Array.from({ length: 27 }, (_, index) =>
          point(`asset-${index}`, `자산 ${index}`, index),
        )}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(26);
    fireEvent.click(screen.getByRole("button", { name: "다음 종목 페이지" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: /자산 26 \(asset-26\)/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 종목 페이지" }));
    expect(
      screen.getByRole("button", { name: /자산 0 \(asset-0\)/ }),
    ).toBeTruthy();
  });
  it("filters by asset and symbol, resets empty results, and opens the selected instrument", () => {
    const onSelect = vi.fn();
    render(<MarketBoard points={points} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "주식·ETF" }));
    expect(screen.queryByRole("button", { name: /KOSPI/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "종목 검색" }), {
      target: { value: "not-found" },
    });
    expect(screen.getByText("조건에 맞는 종목이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /검색 조건 초기화/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "종목 검색" }), {
      target: { value: "NVDA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /NVIDIA \(NVDA\)/ }));
    expect(onSelect).toHaveBeenCalledWith(points[1]);
  });

  it("keeps missing changes at the end in either sort direction", () => {
    render(<MarketBoard points={points} onSelect={() => {}} />);
    for (const sort of ["up", "down"]) {
      fireEvent.change(
        screen.getByRole("combobox", { name: "시장 보드 정렬" }),
        { target: { value: sort } },
      );
      const rows = screen.getAllByRole("row").slice(1);
      expect(
        within(rows.at(-1)!).getByRole("button", {
          name: /누락 종목 \(missing\)/,
        }),
      ).toBeTruthy();
    }
  });

  it("reveals every compact-board row through an explicit expandable list", () => {
    const manyPoints = Array.from({ length: 12 }, (_, index) =>
      point(`asset-${index}`, `자산 ${index}`, index),
    );
    render(<MarketBoard points={manyPoints} onSelect={() => {}} compact />);
    expect(screen.getAllByRole("row")).toHaveLength(9);
    expect(screen.getByText("8 / 12 종목 표시")).toBeTruthy();
    const expand = screen.getByRole("button", { name: /전체 12개 종목 보기/ });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(
      screen.getByRole("button", { name: /자산 11 \(asset-11\)/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /주요 8개로 접기/ }));
    expect(screen.getAllByRole("row")).toHaveLength(9);
  });

  it("preserves date-only observations without fabricating a KST clock time", () => {
    expect(observationTime("2026-10-16")).toBe("2026-10-16 · 일별 공시");
    expect(observationTime("2026-10-16T20:00:00Z")).toContain("KST");
    expect(
      quoteUrl(point("DGS10", "금리", null, { source: "U.S. Treasury" })),
    ).toBe(
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
    );
  });

  it("distinguishes a quiet news feed from provider failure", () => {
    const { rerender } = render(
      <NewsFeed news={[]} sources={[source]} status="ok" />,
    );
    expect(
      screen.getByText("최근 24시간의 관련 뉴스가 없습니다."),
    ).toBeTruthy();
    rerender(
      <NewsFeed
        news={[]}
        sources={[{ ...source, status: "error" }]}
        status="unavailable"
      />,
    );
    expect(
      screen.getByText("뉴스 소스의 응답을 기다리고 있습니다."),
    ).toBeTruthy();
  });

  it("explains partial feed failure without claiming all sources connected", () => {
    const onSources = vi.fn();
    render(
      <NewsFeed
        news={[]}
        sources={[source, { ...source, id: "gdelt", status: "error" }]}
        status="degraded"
        onSources={onSources}
      />,
    );
    expect(
      screen.getByText(
        /응답한 소스에서 최근 24시간에 해당하는 기사를 찾지 못했습니다/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "소스는 연결되었지만 수집 조건에 맞는 기사가 없었습니다.",
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /출처 상태 확인/ }));
    expect(onSources).toHaveBeenCalledOnce();
  });

  it("filters news by source and clearly labels GDELT discovery time", () => {
    const news: NewsItem[] = [
      {
        id: "news1",
        title: "금리 발표",
        source: "GDELT",
        url: "https://example.com/rates",
        publishedAt: "2026-10-18T00:00:00Z",
        summary: "공개 요약",
        tags: ["매크로"],
        score: 1,
        timeKind: "discovered",
      },
    ];
    render(<NewsFeed news={news} sources={[source]} status="ok" />);
    expect(screen.getByText(/발견 .*KST/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "뉴스 검색" }), {
      target: { value: "반도체" },
    });
    expect(screen.getByText("검색 결과가 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
    expect(
      screen.getByRole("link", { name: /금리 발표/ }).getAttribute("target"),
    ).toBe("_blank");
  });

  it("saves editable local watchlist settings with actionable success feedback", async () => {
    const onSaved = vi.fn();
    const instrument = {
      id: "NVDA",
      symbol: "NVDA",
      label: "NVIDIA",
      assetClass: "equity" as const,
      currency: "USD",
      region: "US" as const,
      provider: "yahoo" as const,
    };
    const config = { fredConfigured: false, watchlist: [instrument] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...config,
        watchlist: [{ ...instrument, label: "엔비디아" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsView config={config} onSaved={onSaved} />);
    expect(screen.getByText("키 없이 사용 가능")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "관심 종목 1 표시 이름" }),
      { target: { value: "엔비디아" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          watchlist: [{ symbol: "NVDA", label: "엔비디아", region: "US" }],
        }),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "다음 수집부터 반영",
    );
  });
});
