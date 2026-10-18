import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BriefingState,
  FundamentalMetrics,
  MarketBriefing,
} from "@/lib/domain/briefing";
import type { CollectionSnapshot } from "@/lib/domain/collection";
import type { MarketPoint } from "@/lib/domain/market";
import { BriefingPanel } from "./BriefingPanel";
import { Fundamentals } from "./MarketDetail";
import { scoreFixture, screeningFixture } from "./test-fixtures/scoring";

const point: MarketPoint = {
  id: "NVDA",
  symbol: "NVDA",
  label: "NVIDIA",
  assetClass: "equity",
  value: 120,
  displayValue: "$120.00",
  change: 1,
  changePercent: 1,
  displayChange: "+1.00%",
  direction: "up",
  currency: "USD",
  asOf: "2026-10-18T00:00:00Z",
  source: "Yahoo Finance",
  status: "fresh",
};
const snapshot: CollectionSnapshot = {
  schemaVersion: 1,
  id: "snapshot-current",
  collectedAt: "2026-10-18T00:00:00Z",
  mode: "live",
  marketPoints: [point],
  news: [],
  sources: [],
  quality: {
    fresh: 1,
    stale: 0,
    missing: 0,
    newsStatus: "ok",
    readyForReport: true,
    missingCritical: [],
    warnings: [],
  },
};
const candidate: MarketBriefing["candidates"][number] = {
  symbol: "NVDA",
  action: "buy",
  thesis: "성장과 밸류에이션을 함께 확인할 후보",
  reasons: ["수집된 매출 성장률에 근거"],
  risks: ["성장 둔화 위험"],
  entryCondition: "다음 실적의 성장 유지 확인",
  exitCondition: "성장 훼손 시 비중 재검토",
  invalidation: "현금흐름 악화 시 판단 무효",
  evidenceIds: ["e1"],
};
const report: MarketBriefing = {
  id: "briefing-1",
  snapshotId: snapshot.id,
  generatedAt: "2026-10-18T00:05:00Z",
  dataAsOf: snapshot.collectedAt,
  mode: "live",
  engine: "codex",
  horizon: "수개월 이상 중장기",
  headline: "금리와 실적을 함께 확인하는 중장기 관점",
  summary: "입력된 시장과 재무 데이터에 근거한 분석입니다.",
  marketView: [
    {
      title: "실적 확인",
      interpretation: "수집된 성장 지표를 점검합니다.",
      evidenceIds: ["e1"],
    },
  ],
  candidates: [
    candidate,
    {
      ...candidate,
      symbol: "TSM",
      action: "sell",
      thesis: "보유 시 밸류에이션 재검토",
    },
  ],
  koreaImplications: "수출 업종의 이익과 환율을 함께 확인합니다.",
  currencyView: "달러 원화의 환산 영향을 확인합니다.",
  limitations: ["보유 내역이 제공되지 않았습니다."],
  evidence: [
    {
      id: "e1",
      label: "NVIDIA 재무 관측",
      value: "매출 성장률 10%",
      symbol: "NVDA",
      asOf: "2026-07-31",
      source: "Yahoo Finance",
      url: "https://finance.yahoo.com/quote/NVDA/",
      status: "fresh",
    },
  ],
};
const ready: BriefingState = { report, run: null, matchesSnapshot: true };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe("snapshot-grounded Codex briefing", () => {
  it("shows fixed snapshot candidates before Codex finishes and never attaches fresh scores to an older explanation", () => {
    const screening = screeningFixture([
      scoreFixture("NVDA", { name: "NVIDIA" }),
    ]);
    const current = { ...snapshot, screening };
    const busy: BriefingState = {
      report: null,
      matchesSnapshot: false,
      run: {
        id: "scoring-run",
        snapshotId: snapshot.id,
        stage: "generating",
        startedAt: snapshot.collectedAt,
        finishedAt: null,
        error: null,
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(busy)));
    const { rerender } = render(
      <BriefingPanel
        snapshot={current}
        initialState={busy}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("균형형 고정 투자 후보")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "NVIDIA (NVDA) 점수와 실적 상세" }),
    ).toBeTruthy();
    const older: BriefingState = {
      report: {
        ...report,
        snapshotId: "older",
        candidates: [
          { ...candidate, score: scoreFixture("NVDA", { totalScore: 99 }) },
        ],
      },
      run: null,
      matchesSnapshot: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(older)));
    rerender(
      <BriefingPanel
        key="older-state"
        snapshot={current}
        initialState={older}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByText(/현재 시세와 다른 스냅샷의 이전 분석/),
    ).toBeTruthy();
    expect(screen.queryByText(candidate.thesis)).toBeNull();
    expect(screen.queryByText("99")).toBeNull();
    expect(screen.getByText("이전 분석 · 고정 점수 기준 미적용")).toBeTruthy();
  });
  it("offers candidate shortcuts before optional long-form analysis and reveals the full summary on demand", () => {
    const longReport = {
      ...report,
      summary: "시장과 재무 데이터에 근거한 중장기 판단을 확인합니다. ".repeat(
        12,
      ),
    };
    const longReady: BriefingState = { ...ready, report: longReport };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(longReady)));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={longReady}
        onSelect={() => {}}
      />,
    );
    const summaryToggle = screen.getByRole("button", {
      name: "요약 전체 읽기",
    });
    expect(summaryToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(summaryToggle);
    expect(
      screen
        .getByRole("button", { name: "요약 접기" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    const candidateHeading = screen
      .getByText("중장기 투자 후보")
      .closest<HTMLDivElement>(".sd-candidate-heading")!;
    const scroll = vi.fn();
    Object.defineProperty(candidateHeading, "scrollIntoView", {
      value: scroll,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "매도·축소 후보 1개 바로 보기" }),
    );
    expect(scroll).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
    expect(document.activeElement).toBe(candidateHeading);
    expect(screen.queryByText(candidate.thesis)).toBeNull();
    expect(screen.getByText("보유 시 밸류에이션 재검토")).toBeTruthy();
    const analysisSummary = screen.getByText("시장·한국·환율 상세 해석");
    const analysis = analysisSummary.closest("details")!;
    expect(analysis.hasAttribute("open")).toBe(false);
    fireEvent.click(analysisSummary);
    expect(analysis.hasAttribute("open")).toBe(true);
    expect(
      within(analysis).getByText(report.marketView[0].interpretation),
    ).toBeTruthy();
    expect(within(analysis).getByText(report.koreaImplications)).toBeTruthy();
  });
  it("uses exact archive lookup and ignores failures belonging to another snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        report: null,
        matchesSnapshot: false,
        run: {
          id: "unrelated",
          snapshotId: "other-snapshot",
          stage: "failed",
          startedAt: report.generatedAt,
          finishedAt: report.generatedAt,
          error: "다른 스냅샷 오류",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<BriefingPanel snapshot={snapshot} onSelect={() => {}} />);
    await screen.findByText("아직 이 스냅샷의 브리핑이 없습니다.");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/briefings?snapshotId=${snapshot.id}`,
      expect.anything(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("labels another active snapshot analysis without claiming the current report is being generated", () => {
    const busy: BriefingState = {
      report: null,
      matchesSnapshot: false,
      run: {
        id: "other-run",
        snapshotId: "other-snapshot",
        stage: "generating",
        startedAt: report.generatedAt,
        finishedAt: null,
        error: null,
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(busy)));
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={busy}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "다른 스냅샷의 브리핑을 생성",
    );
    expect(screen.queryByText("이 스냅샷의 분석이 곧 표시됩니다.")).toBeNull();
    expect(
      screen.getByRole("button", { name: /분석 중/ }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("filters real candidate groups, opens matching instruments, and exposes conditions and evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(ready)));
    const onSelect = vi.fn();
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={ready}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("LOCAL CODEX")).toBeTruthy();
    expect(screen.getByText("수개월 이상 · 중장기")).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("group", { name: "투자 후보 종류" })).getByRole(
        "button",
        { name: /매수 후보 1/ },
      ),
    );
    expect(screen.queryByText("보유 시 밸류에이션 재검토")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "NVIDIA (NVDA) 상세 보기" }),
    );
    expect(onSelect).toHaveBeenCalledWith(point);
    const article = screen.getByText(candidate.thesis).closest("article")!;
    fireEvent.click(within(article).getByText("진입·청산 조건과 리스크"));
    expect(within(article).getByText(candidate.entryCondition)).toBeTruthy();
    expect(within(article).getByText(candidate.invalidation)).toBeTruthy();
    fireEvent.click(within(article).getByText("근거 1개 확인"));
    expect(within(article).getByText("매출 성장률 10%")).toBeTruthy();
    expect(
      within(article).getByRole("link", { name: /원본/ }).getAttribute("href"),
    ).toBe(report.evidence[0].url);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/briefings?snapshotId=${snapshot.id}&fallback=1`,
        expect.anything(),
      ),
    );
  });

  it("generates against the selected immutable snapshot and replaces the empty state", async () => {
    let generated = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/briefings") {
        expect(JSON.parse(options!.body as string)).toEqual({
          snapshotId: snapshot.id,
        });
        generated = true;
        return response({
          run: {
            id: "r1",
            snapshotId: snapshot.id,
            stage: "completed",
            startedAt: report.generatedAt,
            finishedAt: report.generatedAt,
            error: null,
          },
        });
      }
      return response(
        generated ? ready : { report: null, run: null, matchesSnapshot: false },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={{ report: null, run: null, matchesSnapshot: false }}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /브리핑 생성/ }));
    await screen.findByText(report.headline);
    expect(
      screen.getByRole("link", { name: /브리핑 저장/ }).getAttribute("href"),
    ).toContain(`snapshotId=${snapshot.id}`);
  });

  it("keeps the prior report with a snapshot warning when the next analysis fails", () => {
    const failed: BriefingState = {
      report: { ...report, snapshotId: "older-snapshot" },
      matchesSnapshot: false,
      run: {
        id: "r2",
        snapshotId: snapshot.id,
        stage: "failed",
        startedAt: report.generatedAt,
        finishedAt: report.generatedAt,
        error: "근거 검증에 실패했습니다.",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(failed)));
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={failed}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("근거 검증에 실패");
    expect(
      screen.getByText(/현재 시세와 다른 스냅샷의 이전 분석/),
    ).toBeTruthy();
    expect(screen.getByText(report.headline)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "NVIDIA (NVDA) 상세 보기" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /브리핑 저장/ }).getAttribute("href"),
    ).toContain("older-snapshot");
  });

  it("never presents a sample recommendation as the current live analysis", () => {
    const sample: BriefingState = {
      report: { ...report, mode: "sample", engine: "sample" },
      run: null,
      matchesSnapshot: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(sample)));
    render(
      <BriefingPanel
        snapshot={snapshot}
        initialState={sample}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText(report.headline)).toBeNull();
    expect(screen.getByText(/샘플과 실데이터 분석은 분리/)).toBeTruthy();
  });
});

describe("long-term fundamental context", () => {
  const fundamentals: FundamentalMetrics = {
    status: "fresh",
    fetchedAt: snapshot.collectedAt,
    periodEnd: "2026-07-31",
    source: "Yahoo Finance",
    financialCurrency: "USD",
    trailingPE: null,
    forwardPE: 25,
    priceToBook: 3,
    marketCap: 1_000_000_000,
    revenueGrowth: 0,
    earningsGrowth: 0.1,
    profitMargins: 0.2,
    returnOnEquity: 0.15,
    debtToEquity: 100,
    freeCashflow: null,
    dividendYield: 0.01,
    expenseRatio: 0.0003,
    fiftyTwoWeekHigh: 150,
    fiftyTwoWeekLow: 80,
    note: "분기 재무",
  };
  it("keeps null values missing, preserves zero growth, and distinguishes ratio units and financial dates", () => {
    render(<Fundamentals point={{ ...point, fundamentals }} />);
    expect(screen.getByText("후행 PER").parentElement?.textContent).toContain(
      "—",
    );
    expect(
      screen.getByText("매출 성장률").parentElement?.textContent,
    ).toContain("0%");
    expect(
      screen.getByText("부채 / 자본").parentElement?.textContent,
    ).toContain("100%");
    expect(screen.getByText("2026-07-31")).toBeTruthy();
    expect(screen.getByText("분기 재무")).toBeTruthy();
  });
  it("shows ETF expense ratios as annual percentages", () => {
    render(
      <Fundamentals
        point={{ ...point, instrumentType: "etf", fundamentals }}
      />,
    );
    expect(
      screen.getByText("연간 운용 보수").parentElement?.textContent,
    ).toContain("0.03%");
  });
});
