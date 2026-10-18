"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BriefingEvidence,
  BriefingRun,
  BriefingState,
  MarketBriefing,
} from "@/lib/domain/briefing";
import type { CollectionSnapshot } from "@/lib/domain/collection";
import type { MarketPoint } from "@/lib/domain/market";
import { fullKst, Icon, observationTime, statusNames } from "./desk-utils";
import { ScreeningCandidates } from "./ScoringDetails";

const active = (run?: BriefingRun | null) =>
  Boolean(run && ["generating", "validating"].includes(run.stage));
const actionLabels = {
  buy: "매수 후보",
  sell: "매도·축소 후보",
  watch: "관찰 후보",
};

async function read<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "브리핑을 불러오지 못했습니다.");
  return body;
}

export function BriefingPanel({
  snapshot,
  initialState,
  onSelect,
}: {
  snapshot: CollectionSnapshot;
  initialState?: BriefingState;
  onSelect: (point: MarketPoint) => void;
}) {
  const [state, setState] = useState<BriefingState | null>(
    initialState || null,
  );
  const [loading, setLoading] = useState(!initialState);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "watch">("all");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const candidateHeading = useRef<HTMLDivElement>(null);
  const allowFallback = initialState !== undefined;
  const runActive = active(state?.run);
  const otherRun = runActive && state?.run?.snapshotId !== snapshot.id;
  const pending = requesting || runActive;
  const report = state?.report?.mode === snapshot.mode ? state.report : null;
  const matches = report?.snapshotId === snapshot.id;
  const screening =
    snapshot.screening || (matches ? report?.screening : undefined);
  const candidateUniverse = screening?.selected || report?.candidates || [];
  const modeMismatch = Boolean(
    state?.report && state.report.mode !== snapshot.mode,
  );
  const runError =
    state?.run?.snapshotId === snapshot.id && state.run.stage === "failed"
      ? state.run.error
      : null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await read<BriefingState>(
          await fetch(
            `/api/briefings?snapshotId=${encodeURIComponent(snapshot.id)}${allowFallback ? "&fallback=1" : ""}`,
            { cache: "no-store", signal },
          ),
        );
        if (!signal?.aborted) {
          setState(next);
          setError(null);
        }
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "브리핑 상태를 확인하지 못했습니다.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [snapshot.id, allowFallback],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    load,
    initialState?.run?.id,
    initialState?.run?.stage,
    initialState?.report?.id,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(
      () => {
        void load(controller.signal);
      },
      runActive ? 1600 : 20_000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load, runActive]);

  async function generate() {
    if (pending) return;
    setRequesting(true);
    setError(null);
    try {
      const next = await read<{ run: BriefingRun }>(
        await fetch("/api/briefings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotId: snapshot.id }),
        }),
      );
      setState((previous) => ({
        report: previous?.report || null,
        matchesSnapshot: previous?.matchesSnapshot || false,
        run: next.run,
      }));
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "브리핑 생성을 시작하지 못했습니다.",
      );
    } finally {
      setRequesting(false);
    }
  }
  const candidates =
    report?.candidates.filter(
      (candidate) => filter === "all" || candidate.action === filter,
    ) || [];
  function showCandidates(action: "buy" | "sell" | "watch") {
    setFilter(action);
    requestAnimationFrame(() => {
      candidateHeading.current?.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
      candidateHeading.current?.focus({ preventScroll: true });
    });
  }
  return (
    <section className="sd-briefing" aria-labelledby="briefing-heading">
      <header className="sd-briefing-heading">
        <div>
          <h2 id="briefing-heading">
            {snapshot.mode === "sample"
              ? "샘플 시장 브리핑"
              : "Codex 시장 브리핑"}
          </h2>
          <span className="sd-horizon">수개월 이상 · 중장기</span>
        </div>
        <div>
          {report && (
            <a
              className="sd-text-link"
              href={`/api/briefings?snapshotId=${encodeURIComponent(report.snapshotId)}&format=markdown&download=1`}
            >
              <Icon name="download" size={14} />
              브리핑 저장
            </a>
          )}
          {(report || pending) && (
            <button
              className="sd-button secondary"
              disabled={pending || loading}
              onClick={() => void generate()}
            >
              <Icon name="refresh" size={14} />
              {pending
                ? "분석 중"
                : report
                  ? "브리핑 다시 생성"
                  : "브리핑 생성"}
            </button>
          )}
        </div>
      </header>
      {pending && (
        <div className="sd-briefing-progress" role="status">
          <span className="sd-spinner" />
          <div>
            <strong>
              {otherRun
                ? "다른 스냅샷의 브리핑을 생성하고 있습니다."
                : state?.run?.stage === "validating"
                  ? "분석 근거와 응답을 검증하고 있습니다."
                  : snapshot.mode === "sample"
                    ? "샘플 브리핑을 준비하고 있습니다."
                    : "Codex가 시세·재무지표·뉴스를 분석하고 있습니다."}
            </strong>
            <span>
              {otherRun
                ? "진행 중인 분석이 끝나면 현재 스냅샷을 분석할 수 있습니다."
                : "현재 스냅샷은 계속 확인할 수 있습니다."}
            </span>
          </div>
        </div>
      )}
      {(error || runError) && (
        <div className="sd-briefing-error" role="alert">
          <Icon name="warning" size={17} />
          <div>
            <strong>브리핑을 완료하지 못했습니다.</strong>
            <p>{error || runError}</p>
          </div>
          <button
            className="sd-text-link"
            onClick={() => void generate()}
            disabled={pending}
          >
            다시 생성 <Icon name="refresh" size={14} />
          </button>
        </div>
      )}
      {modeMismatch && (
        <p className="sd-briefing-mismatch">
          샘플과 실데이터 분석은 분리합니다. 현재 스냅샷의 브리핑을 생성해
          주세요.
        </p>
      )}
      {report ? (
        <>
          {!matches && (
            <p className="sd-briefing-mismatch">
              <Icon name="warning" size={16} />
              현재 시세와 다른 스냅샷의 이전 분석입니다. 분석 데이터 기준:{" "}
              {fullKst(report.dataAsOf)} KST. 최신 스냅샷으로 다시 생성할 수
              있습니다.
            </p>
          )}
          <div className="sd-briefing-summary">
            {!report.screening && (
              <p className="sd-legacy-scoring">
                이전 분석 · 고정 점수 기준 미적용
              </p>
            )}
            <div className="sd-briefing-meta">
              <span className={`sd-mode-tag ${report.mode}`}>
                {report.engine === "sample"
                  ? "SAMPLE · 예시 분석"
                  : "LOCAL CODEX"}
              </span>
              <span>데이터 {fullKst(report.dataAsOf)} KST</span>
              <span>생성 {fullKst(report.generatedAt)} KST</span>
            </div>
            <h3>{report.headline}</h3>
            <p
              className={summaryExpanded ? "" : "sd-summary-condensed"}
              id="briefing-summary-text"
            >
              {report.summary}
            </p>
            {(report.summary.length > 80 || report.summary.includes("\n")) && (
              <button
                className="sd-text-link sd-summary-toggle"
                aria-expanded={summaryExpanded}
                aria-controls="briefing-summary-text"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
              >
                {summaryExpanded ? "요약 접기" : "요약 전체 읽기"}
              </button>
            )}
            <nav
              className="sd-candidate-access"
              aria-label="투자 후보 바로 가기"
            >
              {(["buy", "sell", "watch"] as const).map((action) => {
                const group = candidateUniverse.filter(
                  (candidate) => candidate.action === action,
                );
                return (
                  <button
                    key={action}
                    className={action}
                    onClick={() => showCandidates(action)}
                    aria-label={`${actionLabels[action]} ${group.length}개 바로 보기`}
                  >
                    <span>
                      {action === "buy"
                        ? "매수"
                        : action === "sell"
                          ? "매도·축소"
                          : "관찰"}
                      <strong>{group.length}</strong>
                      <Icon name="arrow" size={14} />
                    </span>
                    <small>
                      {group.length
                        ? group
                            .slice(0, 2)
                            .map((candidate) => candidate.symbol)
                            .join(" · ")
                        : "선정 없음"}
                      {group.length > 2 ? ` 외 ${group.length - 2}` : ""}
                    </small>
                  </button>
                );
              })}
            </nav>
          </div>
          {screening ? (
            <ScreeningCandidates
              analysis={screening}
              points={snapshot.marketPoints}
              filter={filter}
              onFilter={setFilter}
              onSelect={onSelect}
              headingRef={candidateHeading}
              explanations={
                matches && report.screening?.inputHash === screening.inputHash
                  ? report.candidates
                  : undefined
              }
            />
          ) : (
            <>
              <div
                className="sd-candidate-heading"
                ref={candidateHeading}
                tabIndex={-1}
              >
                <div>
                  <h3>중장기 투자 후보</h3>
                  <span>
                    매도·축소 후보는 해당 종목을 보유한 경우의 재검토
                    조건입니다.
                  </span>
                </div>
                <span>{report.candidates.length} CANDIDATES</span>
              </div>
              <div
                className="sd-filter-tabs"
                role="group"
                aria-label="투자 후보 종류"
              >
                {(["all", "buy", "sell", "watch"] as const).map((action) => (
                  <button
                    key={action}
                    className={filter === action ? "is-active" : ""}
                    aria-pressed={filter === action}
                    onClick={() => setFilter(action)}
                  >
                    {action === "all" ? "전체" : actionLabels[action]}{" "}
                    <span>
                      {action === "all"
                        ? report.candidates.length
                        : report.candidates.filter(
                            (candidate) => candidate.action === action,
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              {candidates.length ? (
                <div className="sd-candidate-groups">
                  {(["buy", "sell", "watch"] as const).map((action) => {
                    const group = candidates.filter(
                      (candidate) => candidate.action === action,
                    );
                    return group.length ? (
                      <section
                        key={action}
                        className={`sd-candidate-group ${action}`}
                      >
                        <h3>
                          <span className="sd-candidate-indicator" />
                          {actionLabels[action]} <span>{group.length}</span>
                          {action === "sell" && <small>보유 시 재검토</small>}
                        </h3>
                        {group.map((candidate) => (
                          <Candidate
                            key={`${candidate.action}-${candidate.symbol}`}
                            candidate={candidate}
                            report={report}
                            points={snapshot.marketPoints}
                            onSelect={matches ? onSelect : undefined}
                          />
                        ))}
                      </section>
                    ) : null;
                  })}
                </div>
              ) : (
                <div className="sd-candidate-empty">
                  <p>
                    {filter === "all"
                      ? "현재 자료에서 근거를 충족하는 투자 후보가 선정되지 않았습니다."
                      : `현재 자료에서 선정된 ${actionLabels[filter]}가 없습니다.`}
                  </p>
                </div>
              )}
            </>
          )}
          <details className="sd-briefing-analysis">
            <summary>
              <span>시장·한국·환율 상세 해석</span>
              <small>{report.marketView.length}개 시장 주제</small>
            </summary>
            {report.marketView.length > 0 && (
              <div className="sd-market-views">
                {report.marketView.map((view, index) => (
                  <article key={`${view.title}-${index}`}>
                    <h3>{view.title}</h3>
                    <p>{view.interpretation}</p>
                    <EvidenceList
                      ids={view.evidenceIds}
                      evidence={report.evidence}
                    />
                  </article>
                ))}
              </div>
            )}
            <div className="sd-briefing-context">
              {report.koreaImplications && (
                <section>
                  <h3>한국 시장 시사점</h3>
                  <p>{report.koreaImplications}</p>
                </section>
              )}
              {report.currencyView && (
                <section>
                  <h3>환율과 보유 통화</h3>
                  <p>{report.currencyView}</p>
                </section>
              )}
            </div>
          </details>
          <div className="sd-briefing-foot">
            <EvidenceList
              evidence={report.evidence}
              label={`전체 근거와 출처 ${report.evidence.length}개`}
            />
            {report.limitations.length > 0 && (
              <details className="sd-analysis-limitations">
                <summary>
                  분석의 전제와 한계 {report.limitations.length}개
                </summary>
                <ul>
                  {report.limitations.map((limitation, index) => (
                    <li key={index}>{limitation}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </>
      ) : loading ? (
        <div className="sd-briefing-empty" role="status">
          <span className="sd-spinner" />
          <p>저장된 브리핑을 확인하고 있습니다.</p>
        </div>
      ) : (
        <div className="sd-briefing-empty">
          <Icon name="news" size={24} />
          <div>
            <h3>
              {otherRun
                ? "다른 스냅샷의 분석이 진행 중입니다."
                : pending
                  ? "이 스냅샷의 분석이 곧 표시됩니다."
                  : "아직 이 스냅샷의 브리핑이 없습니다."}
            </h3>
            <p>
              {snapshot.mode === "sample"
                ? "샘플 브리핑은 사용 흐름을 위한 가상 분석이며 실제 투자 근거가 아닙니다."
                : "Codex는 수집한 가격·재무·뉴스의 시장 맥락을 설명합니다. 고정 투자 후보와 점수는 스냅샷의 평가 규칙으로 결정합니다."}
            </p>
          </div>
          {!pending && (
            <button
              className="sd-button primary"
              onClick={() => void generate()}
            >
              브리핑 생성 <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
      )}
      {!report && screening && (
        <ScreeningCandidates
          analysis={screening}
          points={snapshot.marketPoints}
          filter={filter}
          onFilter={setFilter}
          onSelect={onSelect}
          headingRef={candidateHeading}
        />
      )}
    </section>
  );
}

function EvidenceList({
  ids,
  evidence,
  label,
}: {
  ids?: string[];
  evidence: BriefingEvidence[];
  label?: string;
}) {
  const selected = ids
    ? evidence.filter((item) => ids.includes(item.id))
    : evidence;
  if (!selected.length) return null;
  return (
    <details className="sd-evidence">
      <summary>{label || `근거 ${selected.length}개 확인`}</summary>
      <ul>
        {selected.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <span className={`sd-evidence-status ${item.status}`}>
                {statusNames[item.status]}
              </span>
            </div>
            <p>{item.value}</p>
            <div className="sd-evidence-meta">
              <span>{item.source}</span>
              <span>{observationTime(item.asOf)}</span>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer">
                  원본 <Icon name="external" size={12} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Candidate({
  candidate,
  report,
  points,
  onSelect,
}: {
  candidate: MarketBriefing["candidates"][number];
  report: MarketBriefing;
  points: MarketPoint[];
  onSelect?: (point: MarketPoint) => void;
}) {
  const point = points.find((item) => item.symbol === candidate.symbol);
  return (
    <article className="sd-candidate">
      <header>
        <div>
          {point && onSelect ? (
            <button
              className="sd-candidate-name"
              onClick={() => onSelect(point)}
              aria-label={`${point.label} (${candidate.symbol}) 상세 보기`}
            >
              <strong>{point.label}</strong>
              <span>{candidate.symbol}</span>
              <Icon name="arrow" size={14} />
            </button>
          ) : (
            <div className="sd-candidate-name">
              <strong>{point?.label || candidate.symbol}</strong>
              <span>{candidate.symbol}</span>
            </div>
          )}
        </div>
        {point && onSelect && (
          <span className="sd-candidate-price">
            {point.displayValue}
            <small className={`move-${point.direction}`}>
              {point.displayChange}
            </small>
          </span>
        )}
      </header>
      <p className="sd-candidate-thesis">{candidate.thesis}</p>
      <ul className="sd-candidate-reasons">
        {candidate.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
      {candidate.risks[0] && (
        <p className="sd-candidate-risk">
          <strong>핵심 리스크</strong>
          {candidate.risks[0]}
        </p>
      )}
      <details className="sd-candidate-conditions">
        <summary>진입·청산 조건과 리스크</summary>
        <dl>
          <div>
            <dt>
              {candidate.action === "sell"
                ? "축소 검토 조건"
                : "진입 검토 조건"}
            </dt>
            <dd>{candidate.entryCondition}</dd>
          </div>
          <div>
            <dt>
              {candidate.action === "sell"
                ? "매도 재검토 조건"
                : "청산·축소 조건"}
            </dt>
            <dd>{candidate.exitCondition}</dd>
          </div>
          <div>
            <dt>판단 무효화 조건</dt>
            <dd>{candidate.invalidation}</dd>
          </div>
        </dl>
        {candidate.risks.length > 1 && (
          <ul>
            {candidate.risks.slice(1).map((risk, index) => (
              <li key={index}>{risk}</li>
            ))}
          </ul>
        )}
      </details>
      <EvidenceList ids={candidate.evidenceIds} evidence={report.evidence} />
    </article>
  );
}
