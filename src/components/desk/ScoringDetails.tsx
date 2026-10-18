"use client";

import { useState } from "react";
import type {
  FinancialHistory,
  InstrumentScore,
  ScreeningAnalysis,
} from "@/lib/domain/scoring";
import type { MarketPoint } from "@/lib/domain/market";
import type { MarketBriefing } from "@/lib/domain/briefing";
import { Icon, observationTime } from "./desk-utils";

export const scoreModelNames = {
  corporate: "일반 기업",
  financial: "금융업",
  etf: "ETF",
};
export const scoreActionNames = {
  buy: "매수 후보",
  sell: "매도·축소 후보",
  watch: "관찰",
};
export const scoreNumber = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const signedPoints = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${scoreNumber(Math.abs(value))}`;
export function metricValue(
  value: number | null | undefined,
  unit: "percent" | "ratio" | "years" | "number",
) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  if (unit === "percent")
    return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit === "ratio" ? "×" : unit === "years" ? "년" : ""}`;
}

export function ScoringRules({ analysis }: { analysis: ScreeningAnalysis }) {
  return (
    <div className="sd-scoring-rules">
      <div className="sd-model-identity">
        <strong>균형형</strong>
        <span>{analysis.modelVersion}</span>
        <span title="같은 입력 데이터와 같은 모델 버전은 같은 점수·후보를 유지합니다.">
          고정 입력 <code>{analysis.inputHash.slice(0, 10)}</code>
        </span>
        <span>{observationTime(analysis.asOf)}</span>
      </div>
      <details>
        <summary>평가 기준과 재현성</summary>
        <div className="sd-rule-content">
          <p>
            동일 스냅샷·동일 모델의 후보는 재생성해도 유지됩니다. Codex는 시장
            맥락을 설명하며 후보와 점수를 바꾸지 않습니다.
          </p>
          <dl className="sd-rule-weights">
            {analysis.weights.map((weight) => (
              <div key={weight.key}>
                <dt>{weight.label}</dt>
                <dd>{weight.weight}점</dd>
              </div>
            ))}
          </dl>
          <p>
            일반 기업 기본 기준: 매수 {analysis.buyThreshold}점 이상 · 매도·축소{" "}
            {analysis.sellThreshold}점 이하 · 연간 자료{" "}
            {analysis.minAnnualPeriods}개 이상 · 대상 외 동종{" "}
            {analysis.minPeers}개사 이상 · 지표 커버리지 {analysis.minCoverage}%
            이상. 금융업과 ETF는 각 전용 모델을 사용하며 분류 제한 사유를 별도로
            표시합니다.
          </p>
          <p>
            뉴스 가감은 최대 ±{analysis.newsLimit}점입니다. 점수는 수익률이나
            성공 확률이 아닙니다.
          </p>
          {analysis.notes.length > 0 && (
            <ul>
              {analysis.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

export function ScoreSummary({
  score,
  compact = false,
}: {
  score: InstrumentScore;
  compact?: boolean;
}) {
  return (
    <div className={`sd-score-summary ${compact ? "is-compact" : ""}`}>
      <div className="sd-score-total">
        <strong>{scoreNumber(score.totalScore)}</strong>
        <span>/100</span>
      </div>
      <div className="sd-score-decomposition">
        <span>
          기본 <strong>{scoreNumber(score.baseScore)}</strong>
        </span>
        <span>
          뉴스{" "}
          <strong
            className={
              score.news.adjustment > 0
                ? "move-up"
                : score.news.adjustment < 0
                  ? "move-down"
                  : ""
            }
          >
            {signedPoints(score.news.adjustment)}
          </strong>
        </span>
        <span>
          커버리지 <strong>{scoreNumber(score.coverage)}%</strong>
        </span>
      </div>
      <div className="sd-score-qualification">
        <span>
          {scoreModelNames[score.model]} 모델
          {score.rank !== null && ` 내 ${score.rank}위`}
        </span>
        <strong className={score.eligible ? "" : "sd-warning"}>
          {score.eligible ? "평가 요건 충족" : "분류 요건 미충족"}
        </strong>
      </div>
    </div>
  );
}

export function ScoringDetails({
  score,
  analysis,
  points = [],
}: {
  score: InstrumentScore;
  analysis?: ScreeningAnalysis;
  points?: MarketPoint[];
}) {
  return (
    <div className="sd-scoring-detail">
      <ScoreSummary score={score} />
      <div className="sd-score-action-reasons">
        <h4>분류 이유</h4>
        {score.actionReasons?.length ? (
          <ul>
            {score.actionReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p>이전 평가에는 상세 분류 이유가 저장되지 않았습니다.</p>
        )}
      </div>
      <p className="sd-score-meaning">
        총점은 기본 평가와 뉴스 가감의 합계이며 0–100점 범위입니다. 확률·예상
        수익률이 아닙니다.
      </p>
      {score.blockers.length > 0 && (
        <div className="sd-score-blockers">
          <h4>분류를 제한한 조건</h4>
          <ul>
            {score.blockers.map((blocker, index) => (
              <li key={index}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="sd-score-section">
        <h4>
          요소별 평가 <span>점수 / 배점</span>
        </h4>
        <div className="sd-score-components">
          {score.components.map((component) => (
            <details key={component.key}>
              <summary>
                <span>{component.label}</span>
                <strong>
                  {scoreNumber(component.points)}{" "}
                  <small>/ {component.weight}</small>
                </strong>
                <small>자료 {scoreNumber(component.coverage)}%</small>
              </summary>
              <dl>
                {component.metrics.map((metric) => (
                  <div key={metric.key}>
                    <dt>
                      {metric.label}
                      <strong>{metricValue(metric.value, metric.unit)}</strong>
                    </dt>
                    <dd>
                      <span>
                        {scoreNumber(metric.points)} / {metric.maxPoints}점
                      </span>
                      <p>{metric.explanation}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>
      </section>
      {score.model !== "etf" ? (
        <section className="sd-score-section">
          <h4>
            다년 실적 흐름 <span>실제 {score.trend.years}개 연간 자료</span>
          </h4>
          <p className="sd-score-period">
            {score.trend.firstPeriod || "시작일 미제공"} →{" "}
            {score.trend.lastPeriod || "종료일 미제공"} ·{" "}
            {score.trend.currency || "통화 미제공"}
          </p>
          <dl className="sd-trend-metrics">
            <div>
              <dt>매출 CAGR</dt>
              <dd>{metricValue(score.trend.revenueCagr, "percent")}</dd>
            </div>
            <div>
              <dt>순이익 CAGR</dt>
              <dd>{metricValue(score.trend.earningsCagr, "percent")}</dd>
            </div>
            <div>
              <dt>흑자 결산</dt>
              <dd>
                {score.trend.positiveIncomeYears} / {score.trend.years}
              </dd>
            </div>
            <div>
              <dt>양수 FCF</dt>
              <dd>
                {score.trend.positiveFcfYears} / {score.trend.years}
              </dd>
            </div>
          </dl>
          {score.trend.notes.map((note, index) => (
            <p className="sd-score-note" key={index}>
              {note}
            </p>
          ))}
        </section>
      ) : (
        <p className="sd-score-note">
          ETF는 기업의 매출·순이익 결산을 채점하지 않습니다. 전용 평가 요소에서
          보유 비용·가격 이력·위험 지표를 확인할 수 있습니다.
        </p>
      )}
      <PeerDetails score={score} points={points} />
      <NewsScoreImpact score={score} />
      {score.warnings.length > 0 && (
        <details className="sd-score-warnings">
          <summary>추가 확인사항 {score.warnings.length}개</summary>
          <ul>
            {score.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {analysis && (
        <p className="sd-score-model-foot">
          균형형 {analysis.modelVersion} · 입력{" "}
          {analysis.inputHash.slice(0, 10)}
        </p>
      )}
    </div>
  );
}

function PeerDetails({
  score,
  points,
}: {
  score: InstrumentScore;
  points: MarketPoint[];
}) {
  const peers = score.peers;
  return (
    <section className="sd-score-section sd-peer-details">
      <h4>
        동종업계 비교 <span>대상 외 {peers.count}개사</span>
      </h4>
      <p className="sd-peer-group">
        <strong>{peers.groupLabel || "비교 그룹 미확인"}</strong>
        <span>{peers.source}</span>
      </p>
      <p className="sd-score-note">
        {score.model === "etf"
          ? "ETF는 같은 전략 그룹의 지표로 비교하며 기업 연간 결산 기준은 적용하지 않습니다."
          : `대상 최신 연간 결산 ${score.trend.lastPeriod || "미제공"}. 절대 금액 대신 동일 지표의 비율로 비교합니다.`}
      </p>
      {peers.metrics.length > 0 ? (
        <div
          className="sd-score-table-wrap"
          tabIndex={0}
          aria-label="동종업계 비교 표, 가로 스크롤 가능"
        >
          <table>
            <caption className="sr-only">본인과 동종 지표 중앙값 비교</caption>
            <thead>
              <tr>
                <th>지표</th>
                <th>본인</th>
                <th>중앙값</th>
                <th>백분위</th>
                <th>표본</th>
              </tr>
            </thead>
            <tbody>
              {peers.metrics.map((metric) => (
                <tr key={metric.key}>
                  <th scope="row">{metric.label}</th>
                  <td>{metricValue(metric.value, metric.unit)}</td>
                  <td>{metricValue(metric.median, metric.unit)}</td>
                  <td>
                    {metric.percentile === null
                      ? "—"
                      : `${scoreNumber(metric.percentile)} /100`}
                  </td>
                  <td>{metric.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sd-score-note">
          비교할 수 있는 동종업계 지표가 없습니다.
        </p>
      )}
      <p className="sd-score-note">
        표는 좌우로 스크롤할 수 있습니다. 백분위는 유리한 방향으로 계산한 상대
        위치이며 높을수록 비교군보다 유리합니다. 수익률·성공 확률은 아닙니다.
      </p>
      {peers.metrics.some((metric) => metric.members.length > 0) && (
        <details className="sd-peer-members">
          <summary>
            {score.model === "etf"
              ? "비교 ETF와 실측값 확인"
              : "비교 기업과 연간 결산일 확인"}
          </summary>
          {peers.metrics.map(
            (metric) =>
              metric.members.length > 0 && (
                <div key={metric.key}>
                  <h5>{metric.label}</h5>
                  <ul>
                    {metric.members.map((member) => {
                      const related = points.find(
                        (point) => point.symbol === member.symbol,
                      );
                      const fiscal =
                        member.periodEnd ||
                        related?.fundamentals?.history?.periods.at(-1)
                          ?.periodEnd;
                      return (
                        <li key={member.symbol}>
                          <div>
                            <strong>{member.name}</strong>
                            <span>{member.symbol}</span>
                          </div>
                          <strong>
                            {metricValue(member.value, metric.unit)}
                          </strong>
                          <small>
                            {score.model === "etf"
                              ? "기업 결산 미적용"
                              : `연간 결산 ${fiscal || "미제공"}`}
                          </small>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
          )}
        </details>
      )}
      {peers.notes.map((note, index) => (
        <p className="sd-score-note" key={index}>
          {note}
        </p>
      ))}
    </section>
  );
}

export function NewsScoreImpact({ score }: { score: InstrumentScore }) {
  const news = score.news;
  return (
    <section className="sd-score-section sd-news-impact">
      <h4>
        뉴스 영향{" "}
        <strong
          className={
            news.adjustment > 0
              ? "move-up"
              : news.adjustment < 0
                ? "move-down"
                : ""
          }
        >
          {signedPoints(news.adjustment)}점
        </strong>
      </h4>
      <p className="sd-news-impact-status">
        {news.status === "unavailable"
          ? "뉴스 자료 미수집 · 가감점 0점"
          : news.status === "no-match"
            ? "일치 기사 없음 · 가감점 0점"
            : `기업·산업에 일치한 기사 ${news.items.length}건`}
        <span>
          {scoreActionNames[news.beforeAction]} →{" "}
          {scoreActionNames[score.action]} ·{" "}
          {news.changedAction ? "뉴스로 분류 변경" : "분류 유지"}
        </span>
      </p>
      {news.items.length > 0 && (
        <ol className="sd-news-contributions">
          {news.items.map((item, index) => (
            <li key={`${item.newsId}-${index}`}>
              <div className="sd-news-contribution-top">
                <span>
                  {item.match === "company" ? "기업 직접" : "동종 산업"}
                </span>
                <strong
                  className={
                    item.contribution > 0
                      ? "move-up"
                      : item.contribution < 0
                        ? "move-down"
                        : ""
                  }
                >
                  {signedPoints(item.contribution)}점
                </strong>
              </div>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
                <Icon name="external" size={13} />
              </a>
              <div className="sd-news-contribution-meta">
                <span>{item.source}</span>
                <span>{observationTime(item.publishedAt)}</span>
              </div>
              <p>{item.explanation}</p>
              <details>
                <summary>일치 조건과 점수 적용</summary>
                <p>일치어: {item.matchedTerms.join(", ") || "제공 없음"}</p>
                <p>
                  방향:{" "}
                  {
                    {
                      positive: "긍정",
                      negative: "부정",
                      mixed: "혼재",
                      neutral: "중립",
                    }[item.direction]
                  }{" "}
                  · 원점수 {signedPoints(item.rawContribution)} → 적용{" "}
                  {signedPoints(item.contribution)}점
                </p>
                <p>
                  적용 규칙: {item.ruleIds.join(", ") || "가감 규칙 미충족"}
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
      {news.notes.map((note, index) => (
        <p className="sd-score-note" key={index}>
          {note}
        </p>
      ))}
    </section>
  );
}

export function AnnualFinancials({ history }: { history?: FinancialHistory }) {
  if (!history)
    return (
      <section className="sd-annual-financials">
        <h3>연도별 실적</h3>
        <p className="sd-score-note">
          이 스냅샷에는 연간 재무 이력이 없습니다. 누락된 연도나 금액을 추정하지
          않습니다.
        </p>
      </section>
    );
  const periods = [...history.periods].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );
  const money = (value: number | null) =>
    value === null || !Number.isFinite(value)
      ? "—"
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(value);
  return (
    <section className="sd-annual-financials">
      <div className="sd-annual-heading">
        <h3>연도별 실적</h3>
        <span>실제 {periods.length}개 연간 결산</span>
      </div>
      <p className="sd-score-period">
        재무 통화 {history.currency || "미제공"} · 출처 {history.source} · 수집{" "}
        {observationTime(history.fetchedAt, true)}
      </p>
      {periods.length ? (
        <>
          <p className="sd-table-scroll-hint">
            금액 단위 K·M·B · 좌우로 스크롤해 전체 지표 확인
          </p>
          <div
            className="sd-annual-table-wrap"
            tabIndex={0}
            aria-label="연도별 재무 지표 표, 가로 스크롤 가능"
          >
            <table>
              <caption className="sr-only">
                {history.currency || "통화 미제공"} 기준 연간 결산 실적.
                누락값은 대시로 표시합니다.
              </caption>
              <thead>
                <tr>
                  <th>연간 결산일</th>
                  <th>매출</th>
                  <th>순이익</th>
                  <th>영업현금흐름</th>
                  <th>설비투자</th>
                  <th>FCF</th>
                  <th>부채</th>
                  <th>자본</th>
                  <th>자산</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.periodEnd}>
                    <th scope="row">{period.periodEnd}</th>
                    {[
                      period.revenue,
                      period.netIncome,
                      period.operatingCashFlow,
                      period.capitalExpenditure,
                      period.freeCashFlow,
                      period.totalDebt,
                      period.totalEquity,
                      period.totalAssets,
                    ].map((value, index) => (
                      <td key={index}>{money(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="sd-score-note">
          공급자가 연간 결산 자료를 제공하지 않았습니다.
        </p>
      )}
      {history.notes.map((note, index) => (
        <p className="sd-score-note" key={index}>
          {note}
        </p>
      ))}
    </section>
  );
}

export function ScreeningCandidates({
  analysis,
  points,
  filter,
  onFilter,
  onSelect,
  explanations,
  headingRef,
}: {
  analysis: ScreeningAnalysis;
  points: MarketPoint[];
  filter: "all" | "buy" | "sell" | "watch";
  onFilter: (filter: "all" | "buy" | "sell" | "watch") => void;
  onSelect: (point: MarketPoint) => void;
  explanations?: MarketBriefing["candidates"];
  headingRef?: React.Ref<HTMLDivElement>;
}) {
  const selected = analysis.selected.flatMap((candidate) => {
    const score = analysis.scores.find(
      (item) => item.symbol === candidate.symbol,
    );
    return score ? [score] : [];
  });
  return (
    <section className="sd-fixed-candidates">
      <div className="sd-candidate-heading" tabIndex={-1} ref={headingRef}>
        <div>
          <h3>균형형 고정 투자 후보</h3>
          <span>현재 스냅샷의 규칙 기반 분류 · 매도·축소는 보유 시 재검토</span>
        </div>
        <span>{selected.length} CANDIDATES</span>
      </div>
      <ScoringRules analysis={analysis} />
      <div
        className="sd-filter-tabs"
        role="group"
        aria-label="고정 투자 후보 종류"
      >
        {(["all", "buy", "sell", "watch"] as const).map((action) => (
          <button
            key={action}
            aria-pressed={filter === action}
            className={filter === action ? "is-active" : ""}
            onClick={() => onFilter(action)}
          >
            {action === "all" ? "전체" : scoreActionNames[action]}{" "}
            <span>
              {action === "all"
                ? selected.length
                : selected.filter((score) => score.action === action).length}
            </span>
          </button>
        ))}
      </div>
      <div className="sd-candidate-groups">
        {(["buy", "sell", "watch"] as const).map((action) => {
          const group = selected.filter(
            (score) =>
              score.action === action &&
              (filter === "all" || filter === action),
          );
          return group.length ? (
            <section className={`sd-candidate-group ${action}`} key={action}>
              <h3>
                <span className="sd-candidate-indicator" />
                {scoreActionNames[action]}
                <span>{group.length}</span>
                {action === "sell" && <small>보유 시 재검토</small>}
              </h3>
              {group.map((score) => {
                const point = points.find(
                  (item) => item.symbol === score.symbol,
                );
                const explanation = explanations?.find(
                  (item) =>
                    item.symbol === score.symbol &&
                    item.action === score.action,
                );
                return (
                  <article
                    className="sd-candidate sd-scored-candidate"
                    key={score.symbol}
                  >
                    <header>
                      {point ? (
                        <button
                          className="sd-candidate-name"
                          aria-label={`${score.name} (${score.symbol}) 점수와 실적 상세`}
                          onClick={() => onSelect(point)}
                        >
                          <strong>{score.name}</strong>
                          <span>{score.symbol}</span>
                          <Icon name="arrow" size={14} />
                        </button>
                      ) : (
                        <div className="sd-candidate-name">
                          <strong>{score.name}</strong>
                          <span>{score.symbol}</span>
                        </div>
                      )}
                    </header>
                    <ScoreSummary score={score} compact />
                    {score.actionReasons?.[0] && (
                      <p className="sd-score-action-preview">
                        <strong>분류 이유</strong>
                        {score.actionReasons[0]}
                      </p>
                    )}
                    <ul className="sd-candidate-reasons">
                      {score.components
                        .filter((component) => component.points !== null)
                        .slice(0, 2)
                        .map(
                          (component) =>
                            `${component.label} ${scoreNumber(component.points)} / ${component.weight}점`,
                        )
                        .map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                    </ul>
                    {explanation &&
                      (explanation.thesis ||
                        explanation.reasons.length > 0) && (
                        <details className="sd-candidate-rationale">
                          <summary>판단 근거 전체</summary>
                          {explanation.thesis && (
                            <p className="sd-candidate-thesis">
                              {explanation.thesis}
                            </p>
                          )}
                          <ul className="sd-candidate-reasons">
                            {explanation.reasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    {score.blockers[0] && (
                      <p className="sd-candidate-risk">
                        <strong>분류 제한</strong>
                        {score.blockers[0]}
                      </p>
                    )}
                    {explanation && (
                      <details className="sd-candidate-conditions">
                        <summary>진입·청산·판단 무효화 조건</summary>
                        <dl>
                          <div>
                            <dt>진입·재검토 조건</dt>
                            <dd>{explanation.entryCondition}</dd>
                          </div>
                          <div>
                            <dt>청산·축소 조건</dt>
                            <dd>{explanation.exitCondition}</dd>
                          </div>
                          <div>
                            <dt>판단 무효화</dt>
                            <dd>{explanation.invalidation}</dd>
                          </div>
                        </dl>
                        <ul>
                          {explanation.risks.map((risk, index) => (
                            <li key={index}>{risk}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <details className="sd-score-disclosure">
                      <summary>개별 점수·실적·동종 비교·뉴스 영향</summary>
                      <ScoringDetails
                        score={score}
                        analysis={analysis}
                        points={points}
                      />
                      {point?.instrumentType !== "etf" &&
                        point?.fundamentals?.history && (
                          <AnnualFinancials
                            history={point.fundamentals.history}
                          />
                        )}
                    </details>
                  </article>
                );
              })}
            </section>
          ) : null;
        })}
      </div>
      {!selected.some(
        (score) => filter === "all" || score.action === filter,
      ) && (
        <div className="sd-candidate-empty">
          <p>
            이 분류에 해당하는 고정 후보가 없습니다. 다른 분류 또는 전체 종목
            평가에서 데이터를 확인할 수 있습니다.
          </p>
        </div>
      )}
    </section>
  );
}

export function ScoreExplorer({
  analysis,
  points,
  onSelect,
}: {
  analysis?: ScreeningAnalysis;
  points: MarketPoint[];
  onSelect: (point: MarketPoint) => void;
}) {
  const [model, setModel] = useState<InstrumentScore["model"]>("corporate");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [sort, setSort] = useState("score");
  const [page, setPage] = useState(1);
  if (!analysis)
    return (
      <div className="sd-empty-small">
        <h3>이전 분석 · 고정 점수 기준 미적용</h3>
        <p>
          현재 스냅샷에는 개별 점수와 동종 비교가 없습니다. 시장 데이터를 다시
          수집하면 새 평가 기준을 적용합니다.
        </p>
      </div>
    );
  const filtered = analysis.scores.filter(
    (score) =>
      score.model === model &&
      `${score.name} ${score.symbol}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()) &&
      (action === "all" ||
        (action === "insufficient"
          ? !score.eligible
          : score.action === action)),
  );
  filtered.sort((a, b) => {
    if (sort === "coverage")
      return a.coverage - b.coverage || a.symbol.localeCompare(b.symbol);
    if (a.totalScore === null)
      return b.totalScore === null ? a.symbol.localeCompare(b.symbol) : 1;
    if (b.totalScore === null) return -1;
    return (
      (sort === "ascending"
        ? a.totalScore - b.totalScore
        : b.totalScore - a.totalScore) || a.symbol.localeCompare(b.symbol)
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages),
    shown = filtered.slice((current - 1) * 20, current * 20);
  return (
    <section
      className="sd-score-explorer"
      aria-labelledby="score-explorer-heading"
    >
      <div className="sd-panel-heading">
        <h2 id="score-explorer-heading">전체 종목 평가</h2>
        <span>{analysis.scores.length} SCORES</span>
      </div>
      <ScoringRules analysis={analysis} />
      <div className="sd-filter-tabs" role="group" aria-label="평가 모델">
        {(["corporate", "financial", "etf"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={model === value}
            className={model === value ? "is-active" : ""}
            onClick={() => {
              setModel(value);
              setPage(1);
            }}
          >
            {scoreModelNames[value]}{" "}
            <span>
              {analysis.scores.filter((score) => score.model === value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="sd-score-explorer-tools">
        <label className="sd-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label="종목 평가 검색"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="이름 또는 심볼 검색"
          />
        </label>
        <label>
          <span className="sr-only">점수 분류</span>
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">전체 분류</option>
            <option value="buy">매수 후보</option>
            <option value="sell">매도·축소 후보</option>
            <option value="watch">관찰</option>
            <option value="insufficient">데이터·분류 요건 미충족</option>
          </select>
        </label>
        <label>
          <span className="sr-only">점수 정렬</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="score">같은 모델 점수 높은 순</option>
            <option value="ascending">같은 모델 점수 낮은 순</option>
            <option value="coverage">커버리지 낮은 순</option>
          </select>
        </label>
      </div>
      <p className="sd-score-note sd-explorer-note">
        서로 다른 모델은 섞어 순위를 매기지 않습니다. 행을 펼치면 모든 평가
        근거를 확인할 수 있습니다.
      </p>
      {shown.length ? (
        <ol className="sd-score-list">
          {shown.map((score) => (
            <li key={score.symbol}>
              <details>
                <summary>
                  <span className="sd-score-list-name">
                    <strong>{score.name}</strong>
                    <small>
                      {score.symbol} · {scoreModelNames[score.model]}
                    </small>
                  </span>
                  <span className="sd-score-list-total">
                    {scoreNumber(score.totalScore)}
                    <small>/100</small>
                  </span>
                  <span className="sd-score-list-meta">
                    기본 {scoreNumber(score.baseScore)} · 뉴스{" "}
                    {signedPoints(score.news.adjustment)}
                    <small>
                      자료 {scoreNumber(score.coverage)}% ·{" "}
                      {score.eligible
                        ? scoreActionNames[score.action]
                        : "요건 미충족 · 관찰"}
                    </small>
                  </span>
                </summary>
                <div className="sd-score-list-body">
                  {points.find((point) => point.symbol === score.symbol) && (
                    <button
                      className="sd-text-link"
                      onClick={() =>
                        onSelect(
                          points.find(
                            (point) => point.symbol === score.symbol,
                          )!,
                        )
                      }
                    >
                      시세·연도별 실적 상세 <Icon name="arrow" size={14} />
                    </button>
                  )}
                  <ScoringDetails
                    score={score}
                    analysis={analysis}
                    points={points}
                  />
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sd-empty-small">
          <h3>조건에 맞는 평가가 없습니다.</h3>
          <button
            className="sd-text-link"
            onClick={() => {
              setQuery("");
              setAction("all");
              setPage(1);
            }}
          >
            검색·분류 초기화
          </button>
        </div>
      )}
      <div className="sd-pagination">
        <span>
          {filtered.length}개 평가 · {scoreModelNames[model]} 모델
        </span>
        <div>
          <button
            className="sd-button secondary"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            이전 평가
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            className="sd-button secondary"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            다음 평가
          </button>
        </div>
      </div>
    </section>
  );
}
