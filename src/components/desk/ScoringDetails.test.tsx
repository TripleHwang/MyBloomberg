import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AnnualFinancials,
  NewsScoreImpact,
  ScoreExplorer,
  ScoreSummary,
  ScoringDetails,
  ScreeningCandidates,
} from "./ScoringDetails";
import {
  annualFixture,
  scoreFixture,
  screeningFixture,
} from "./test-fixtures/scoring";

describe("reproducible scoring explanations", () => {
  it("keeps candidate cards compact while preserving every full rationale behind a disclosure", () => {
    const reasons = Array.from(
      { length: 5 },
      (_, index) =>
        `상세 판단 근거 ${index + 1}: 수집된 연간 실적과 비율을 확인한 설명입니다.`,
    );
    render(
      <ScreeningCandidates
        analysis={screeningFixture()}
        points={[]}
        filter="all"
        onFilter={() => {}}
        onSelect={() => {}}
        explanations={[
          {
            symbol: "ACME",
            action: "buy",
            thesis: "전체 판단을 설명하는 긴 논지입니다.",
            reasons,
            risks: ["실적 악화 가능성"],
            entryCondition: "실적 유지",
            exitCondition: "실적 훼손",
            invalidation: "자본 감소",
            evidenceIds: [],
          },
        ]}
      />,
    );
    const rationale = screen.getByText("판단 근거 전체").closest("details")!;
    expect(rationale.hasAttribute("open")).toBe(false);
    fireEvent.click(within(rationale).getByText("판단 근거 전체"));
    expect(rationale.hasAttribute("open")).toBe(true);
    expect(
      within(rationale).getByText("전체 판단을 설명하는 긴 논지입니다."),
    ).toBeTruthy();
    expect(within(rationale).getAllByRole("listitem")).toHaveLength(5);
    for (const reason of reasons)
      expect(within(rationale).getByText(reason)).toBeTruthy();
  });
  it("keeps the actual watch classification reason readable even with a high score and complete data", () => {
    const reason =
      "총점은 매수 기준 이상이지만 최근 연간 FCF가 음수여서 관찰로 분류했습니다.";
    render(
      <ScoringDetails
        score={scoreFixture("ACME", {
          baseScore: 80,
          totalScore: 82,
          eligible: true,
          action: "watch",
          actionReasons: [reason],
        })}
      />,
    );
    expect(screen.getByText("평가 요건 충족")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "분류 이유" })).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
  });
  it("preserves quarter-point news effects in totals, contributions and raw rule values", () => {
    const score = scoreFixture();
    render(
      <ScoringDetails
        score={{
          ...score,
          totalScore: 68.25,
          coverage: 99.25,
          action: "watch",
          news: {
            ...score.news,
            adjustment: 0.25,
            changedAction: false,
            items: [
              {
                ...score.news.items[0],
                rawContribution: 0.5,
                contribution: 0.5,
              },
              {
                ...score.news.items[1],
                direction: "negative",
                rawContribution: -0.25,
                contribution: -0.25,
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText("68.25")).toBeTruthy();
    expect(screen.getByText("+0.25")).toBeTruthy();
    expect(screen.getByText("99.25%")).toBeTruthy();
    expect(screen.getByText("−0.25점")).toBeTruthy();
    const news = screen
      .getByRole("link", { name: "Software industry update" })
      .closest("li")!;
    fireEvent.click(within(news).getByText("일치 조건과 점수 적용"));
    expect(within(news).getByText(/원점수 −0.25 → 적용 −0.25점/)).toBeTruthy();
  });
  it("distinguishes missing scores from real zero and exposes base plus news decomposition", () => {
    const { rerender } = render(<ScoreSummary score={scoreFixture()} />);
    expect(screen.getByText("70")).toBeTruthy();
    expect(screen.getByText("68")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    rerender(
      <ScoreSummary
        score={scoreFixture("NONE", {
          baseScore: 0,
          totalScore: null,
          coverage: 0,
          eligible: false,
          rank: null,
          news: {
            adjustment: 0,
            status: "unavailable",
            beforeAction: "watch",
            changedAction: false,
            items: [],
            notes: [],
          },
        })}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByText("분류 요건 미충족")).toBeTruthy();
  });

  it("shows actual component metrics and peer medians, percentiles, members and fiscal dates", () => {
    render(
      <ScoringDetails score={scoreFixture()} analysis={screeningFixture()} />,
    );
    const growth = screen.getByText("성장").closest("summary")!;
    fireEvent.click(growth);
    expect(screen.getAllByText("10%").length).toBeGreaterThan(0);
    expect(
      screen.getByText("실제 연간 결산 네 개로 계산했습니다."),
    ).toBeTruthy();
    expect(screen.getByText("대상 외 2개사")).toBeTruthy();
    expect(screen.getByText("25×")).toBeTruthy();
    expect(screen.getByText("50 /100")).toBeTruthy();
    expect(screen.getByText(/높을수록 비교군보다 유리합니다/)).toBeTruthy();
    fireEvent.click(screen.getByText("비교 기업과 연간 결산일 확인"));
    expect(screen.getByText("Beta Corp")).toBeTruthy();
    expect(screen.getByText("연간 결산 2025-09-30")).toBeTruthy();
  });

  it("traces positive and zero news contributions and their effect on the category", () => {
    render(<NewsScoreImpact score={scoreFixture()} />);
    expect(screen.getByText(/뉴스로 분류 변경/)).toBeTruthy();
    expect(screen.getByText("기업 직접")).toBeTruthy();
    expect(screen.getByText("동종 산업")).toBeTruthy();
    expect(screen.getByText("0점")).toBeTruthy();
    expect(
      screen.getByText("산업명만 일치했으며 가감 규칙은 충족하지 않았습니다."),
    ).toBeTruthy();
    const article = screen.getByRole("link", {
      name: "Acme earnings beat estimates",
    });
    expect(article.getAttribute("href")).toBe("https://example.com/earnings");
    fireEvent.click(
      within(article.closest("li")!).getByText("일치 조건과 점수 적용"),
    );
    expect(screen.getByText(/원점수 \+2 → 적용 \+2점/)).toBeTruthy();
  });

  it("keeps no-match news distinct from unavailable news", () => {
    const score = scoreFixture();
    const news = {
      adjustment: 0,
      status: "no-match" as const,
      beforeAction: "watch" as const,
      changedAction: false,
      items: [],
      notes: [],
    };
    const { rerender } = render(
      <NewsScoreImpact score={{ ...score, action: "watch", news }} />,
    );
    expect(screen.getByText("일치 기사 없음 · 가감점 0점")).toBeTruthy();
    rerender(
      <NewsScoreImpact
        score={{
          ...score,
          action: "watch",
          news: { ...news, status: "unavailable" },
        }}
      />,
    );
    expect(screen.getByText("뉴스 자료 미수집 · 가감점 0점")).toBeTruthy();
  });

  it("renders exactly the available annual periods without zero-filling missing amounts", () => {
    render(<AnnualFinancials history={annualFixture} />);
    expect(screen.getByText("실제 4개 연간 결산")).toBeTruthy();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getAllByRole("cell")[0].textContent).toBe("—");
    expect(within(rows[1]).getAllByRole("cell")[0].textContent).toBe("0");
    expect(screen.getByText(/재무 통화 USD/)).toBeTruthy();
    expect(
      screen.getByLabelText("연도별 재무 지표 표, 가로 스크롤 가능"),
    ).toBeTruthy();
  });

  it("compares ranks only within the chosen model and exposes insufficient-data rows", () => {
    const scores = [
      scoreFixture(),
      scoreFixture("ETF-X", {
        name: "Index ETF",
        kind: "etf",
        model: "etf",
        totalScore: 99,
      }),
      scoreFixture("BANK", {
        name: "Example Bank",
        model: "financial",
        eligible: false,
        action: "watch",
        blockers: ["건전성 자료 미수집"],
      }),
    ];
    render(
      <ScoreExplorer
        analysis={screeningFixture(scores)}
        points={[]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Acme Corporation")).toBeTruthy();
    expect(screen.queryByText("Index ETF")).toBeNull();
    fireEvent.click(
      within(screen.getByRole("group", { name: "평가 모델" })).getByRole(
        "button",
        { name: /ETF 1/ },
      ),
    );
    expect(screen.getByText("Index ETF")).toBeTruthy();
    expect(screen.queryByText("Acme Corporation")).toBeNull();
    fireEvent.click(
      within(screen.getByRole("group", { name: "평가 모델" })).getByRole(
        "button",
        { name: /금융업 1/ },
      ),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "점수 분류" }), {
      target: { value: "insufficient" },
    });
    expect(screen.getByText("Example Bank")).toBeTruthy();
    fireEvent.click(screen.getByText("Example Bank"));
    expect(screen.getByText("건전성 자료 미수집")).toBeTruthy();
  });
});
