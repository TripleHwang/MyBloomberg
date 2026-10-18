"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CollectionMode,
  CollectionRun,
  CollectionSnapshot,
  DeskCollectionState,
} from "@/lib/domain/collection";
import type { MarketPoint } from "@/lib/domain/market";
import type { InstrumentScore, ScreeningAnalysis } from "@/lib/domain/scoring";
import {
  ArchiveView,
  MarketBoard,
  NewsFeed,
  SettingsView,
  SourcePanel,
} from "./DeskViews";
import { MarketDetail } from "./MarketDetail";
import { BriefingPanel } from "./BriefingPanel";
import { ScoreExplorer } from "./ScoringDetails";
import {
  fullKst,
  Icon,
  kst,
  observationTime,
  Sparkline,
  stageNames,
  statusNames,
} from "./desk-utils";

type View =
  | "overview"
  | "macro"
  | "equities"
  | "news"
  | "archive"
  | "sources"
  | "settings";
const navigation: Array<{ id: View; label: string; english: string }> = [
  { id: "overview", label: "오버뷰", english: "OVERVIEW" },
  { id: "macro", label: "매크로", english: "MACRO" },
  { id: "equities", label: "종목·ETF", english: "EQUITIES" },
  { id: "news", label: "뉴스", english: "NEWS" },
  { id: "archive", label: "아카이브", english: "ARCHIVE" },
  { id: "sources", label: "출처 상태", english: "SOURCES" },
  { id: "settings", label: "설정", english: "SETTINGS" },
];
const core = [
  { id: "kospi", label: "KOSPI", group: "KOREA" },
  { id: "nasdaq", label: "NASDAQ", group: "U.S. EQUITY" },
  { id: "usdkrw", label: "USD / KRW", group: "CURRENCY" },
  { id: "us10y", label: "US 10Y", group: "U.S. TREASURY" },
  { id: "wti", label: "WTI", group: "ENERGY" },
  { id: "btc", label: "BITCOIN", group: "DIGITAL ASSET" },
];
const isActive = (run: CollectionRun | null | undefined) =>
  Boolean(run && !["completed", "failed"].includes(run.stage));

async function readResponse<T>(response: Response): Promise<T> {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "서버의 응답을 읽지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  }
  if (!response.ok)
    throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}

export function CollectionDesk() {
  const [state, setState] = useState<DeskCollectionState | null>(null);
  const [view, setView] = useState<View>("overview");
  const [equityMode, setEquityMode] = useState<"quotes" | "scores">("quotes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const [archive, setArchive] = useState<CollectionSnapshot | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    point: MarketPoint;
    sample: boolean;
    score?: InstrumentScore;
    screening?: ScreeningAnalysis;
    comparisonPoints?: MarketPoint[];
  } | null>(null);
  const runRef = useRef<CollectionRun | null>(null);
  const startingRef = useRef(false);
  const contentRef = useRef<HTMLElement>(null);
  const running = starting || isActive(state?.run);
  const activeRunId = isActive(state?.run) ? state?.run?.id : null;
  const snapshot = archive || state?.snapshot || null;
  const sample = snapshot?.mode === "sample";
  const selectedNav = navigation.find((item) => item.id === view)!;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await readResponse<DeskCollectionState>(
        await fetch("/api/desk", { cache: "no-store", signal }),
      );
      if (signal?.aborted) return;
      if (
        runRef.current &&
        isActive(runRef.current) &&
        next.run?.id === runRef.current.id &&
        !isActive(next.run)
      ) {
        setNotice(
          next.run?.stage === "failed"
            ? "수집이 중단되었습니다. 마지막 저장 데이터는 보존됩니다."
            : next.snapshot &&
                (next.snapshot.quality.stale ||
                  next.snapshot.quality.missing ||
                  next.snapshot.quality.newsStatus !== "ok")
              ? "수집을 완료했습니다. 지연·누락 데이터와 출처 상태를 확인해 주세요."
              : "새 시장 스냅샷을 저장했습니다.",
        );
      }
      runRef.current = next.run;
      setState(next);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "데스크에 연결하지 못했습니다.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(
      () => {
        void load(controller.signal);
      },
      activeRunId ? 1600 : 60_000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [activeRunId, load]);

  function navigate(next: View) {
    setView(next);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      contentRef.current?.focus({ preventScroll: true });
    });
  }
  async function collect(mode: CollectionMode) {
    if (startingRef.current || running) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setNotice("");
    try {
      const result = await readResponse<{ run: CollectionRun }>(
        await fetch("/api/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        }),
      );
      runRef.current = result.run;
      setState((previous) =>
        previous ? { ...previous, run: result.run } : previous,
      );
      setArchive(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "수집을 시작하지 못했습니다.",
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }
  async function openSnapshot(id: string) {
    setOpeningId(id);
    setError(null);
    try {
      const previous = await readResponse<CollectionSnapshot>(
        await fetch(`/api/snapshots?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        }),
      );
      setArchive(previous);
      navigate("overview");
      setNotice("보관된 스냅샷을 열었습니다. 수집 당시 데이터입니다.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "스냅샷을 열지 못했습니다.",
      );
    } finally {
      setOpeningId(null);
    }
  }
  const select = (point: MarketPoint) =>
    setDetail({
      point,
      sample: Boolean(sample),
      score: snapshot?.screening?.scores.find(
        (score) => score.symbol === point.symbol,
      ),
      screening: snapshot?.screening,
      comparisonPoints: snapshot?.marketPoints,
    });
  const sourceIssueCount =
    snapshot?.sources.filter((source) => source.status !== "ok").length || 0;
  const failed = state?.run?.stage === "failed" ? state.run.error : null;

  return (
    <div className="collection-desk">
      <a className="skip-link" href="#collection-content">
        본문으로 건너뛰기
      </a>
      <aside className="sd-rail">
        <button
          className="sd-brand"
          onClick={() => navigate("overview")}
          aria-label="Signal Desk 오버뷰"
        >
          S<span>/</span>D<span className="sd-brand-dot" />
        </button>
        <nav aria-label="데스크 탐색">
          <ul>
            {navigation.map((item) => (
              <li key={item.id}>
                <button
                  className={view === item.id ? "is-active" : ""}
                  onClick={() => navigate(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                >
                  <Icon name={item.id} size={20} />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sd-rail-foot">
          <span className="sd-local-dot" />
          LOCAL
          <br />
          <span>SEOUL / KST</span>
        </div>
      </aside>
      <div className="sd-shell">
        <header className="sd-topbar">
          <div className="sd-location">
            <button
              className="sd-mobile-brand"
              onClick={() => navigate("overview")}
              aria-label="Signal Desk 오버뷰"
            >
              S<span>/</span>D
            </button>
            <span>SIGNAL DESK</span>
            <span className="sd-top-divider">/</span>
            <strong>{selectedNav.english}</strong>
          </div>
          <div className="sd-top-meta">
            <span>
              <i className="sd-local-dot" /> LOCAL WORKSPACE
            </span>
            <span>ASIA / SEOUL</span>
          </div>
        </header>
        <div className="sd-mobile-nav">
          <nav aria-label="모바일 데스크 탐색">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={view === item.id ? "is-active" : ""}
                aria-current={view === item.id ? "page" : undefined}
              >
                {item.label}
                {item.id === "sources" && sourceIssueCount > 0 && (
                  <span>{sourceIssueCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="sd-working-toolbar">
          <h1>{selectedNav.label}</h1>
          <div className="sd-toolbar-actions">
            <div className="sd-last-collected">
              <span>LAST COLLECTED</span>
              <strong>
                {state?.snapshot
                  ? `${kst(state.snapshot.collectedAt, true)} KST`
                  : "첫 수집을 기다리는 중"}
              </strong>
            </div>
            <button
              className="sd-button primary"
              onClick={() => void collect("live")}
              disabled={running || loading || !state}
            >
              <Icon name="refresh" size={16} />
              <span>{running ? "수집 진행 중" : "시장 데이터 수집"}</span>
            </button>
          </div>
        </div>
        <div className="sd-context-bar">
          <div>
            <span className={`sd-mode-tag ${snapshot?.mode || "empty"}`}>
              {snapshot
                ? sample
                  ? "SAMPLE"
                  : "LIVE DATA"
                : "READY TO COLLECT"}
            </span>
            <span>
              {snapshot
                ? `${fullKst(snapshot.collectedAt)} KST 기준`
                : "시세 · 뉴스 · 데이터 품질을 하나의 스냅샷으로"}
            </span>
            {archive && <span className="sd-archive-tag">보관본 열람</span>}
          </div>
          <div>
            {archive ? (
              <button
                className="sd-text-link"
                onClick={() => {
                  setArchive(null);
                  setNotice("최신 수집 데이터로 돌아왔습니다.");
                }}
              >
                최신 데이터로 <Icon name="arrow" size={14} />
              </button>
            ) : (
              <button
                className="sd-text-link"
                disabled={running || !state}
                onClick={() => void collect("sample")}
              >
                {sample ? "샘플 새로 불러오기" : "샘플 둘러보기"}
                <Icon name="arrow" size={14} />
              </button>
            )}
          </div>
        </div>
        {sample && (
          <div className="sd-sample-banner">
            <span className="sd-sample-marker">SAMPLE DATA</span>
            <p>
              이 화면은 사용 흐름을 살펴보는 예시입니다.{" "}
              <strong>실제 시장 데이터가 아닙니다.</strong>
            </p>
            <button disabled={running} onClick={() => void collect("live")}>
              실데이터 수집 <Icon name="arrow" size={14} />
            </button>
          </div>
        )}
        {running && (
          <div className="sd-progress" role="status" aria-live="polite">
            <div className="sd-progress-label">
              <span className="sd-spinner" />
              <strong>
                {starting
                  ? "수집 시작 중"
                  : state?.run
                    ? stageNames[state.run.stage]
                    : "수집 중"}
              </strong>
              <span>
                {state?.run?.mode === "sample" ? "샘플" : "실데이터"} · 현재
                화면은 유지됩니다
              </span>
            </div>
            <ol>
              {["collecting", "validating", "saving"].map((stage, index) => {
                const activeIndex = [
                  "collecting",
                  "validating",
                  "saving",
                ].indexOf(state?.run?.stage || "collecting");
                return (
                  <li
                    className={activeIndex >= index ? "is-active" : ""}
                    key={stage}
                  >
                    <span>{index + 1}</span>
                    {["수집", "검증", "저장"][index]}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {(error || failed) && (
          <div className="sd-alert" role="alert">
            <Icon name="warning" size={19} />
            <div>
              <strong>
                {error
                  ? "연결을 확인해 주세요."
                  : "마지막 수집이 완료되지 않았습니다."}
              </strong>
              <p>{error || failed}</p>
            </div>
            <button
              className="sd-text-link"
              disabled={running}
              onClick={() => {
                if (error) {
                  setLoading(!state);
                  void load();
                } else void collect("live");
              }}
            >
              다시 시도 <Icon name="refresh" size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="sd-notice" role="status">
            <Icon name="check" size={16} />
            <span>{notice}</span>
            <button
              className="sd-icon-button"
              aria-label="안내 닫기"
              onClick={() => setNotice("")}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        <main
          className="sd-content"
          id="collection-content"
          ref={contentRef}
          tabIndex={-1}
        >
          {loading ? (
            <div className="sd-loading" role="status">
              <span className="sd-spinner" />
              <p>로컬 데스크를 열고 있습니다.</p>
              <div className="sd-loading-lines">
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : !state ? (
            <div className="sd-empty-small">
              <Icon name="warning" size={32} />
              <h2>데스크를 불러오지 못했습니다.</h2>
              <p>위의 오류를 확인한 뒤 다시 시도해 주세요.</p>
            </div>
          ) : view === "archive" ? (
            <ArchiveView
              history={state.history}
              selectedId={snapshot?.id}
              openingId={openingId}
              onSelect={(id) => void openSnapshot(id)}
            />
          ) : view === "settings" ? (
            <SettingsView
              config={state.config}
              onSaved={(config) => setState({ ...state, config })}
            />
          ) : view === "sources" ? (
            <SourcePanel
              sources={snapshot?.sources || []}
              fredConfigured={state.config.fredConfigured}
              onSettings={() => navigate("settings")}
            />
          ) : !snapshot ? (
            <FirstRun
              running={running}
              onCollect={() => void collect("live")}
              onSample={() => void collect("sample")}
              onSettings={() => navigate("settings")}
            />
          ) : view === "overview" ? (
            <>
              <section
                className="sd-core-markets"
                aria-labelledby="core-markets-heading"
              >
                <h2 id="core-markets-heading" className="sr-only">
                  핵심 시장
                </h2>
                <div className="sd-core-grid">
                  {core.map((item) => {
                    const point = snapshot.marketPoints.find(
                      (point) => point.id === item.id,
                    );
                    return (
                      <button
                        className={`sd-core-point ${point?.status || "missing"}`}
                        key={item.id}
                        disabled={!point}
                        onClick={() => point && select(point)}
                      >
                        <div className="sd-core-top">
                          <span>{item.group}</span>
                          <span
                            className={`sd-dot ${point?.status || "missing"}`}
                          />
                          <span className="sr-only">
                            {point ? statusNames[point.status] : "미수집"}
                          </span>
                        </div>
                        <h3>
                          {item.label}
                          <Icon name="arrow" size={13} />
                        </h3>
                        <div className="sd-core-price">
                          {point?.displayValue || "—"}
                        </div>
                        <div className="sd-core-bottom">
                          <span
                            className={`move-${point?.direction || "flat"}`}
                          >
                            {point?.displayChange || "관측값 없음"}
                          </span>
                          <Sparkline
                            values={(point?.history || []).map(
                              (entry) => entry.value,
                            )}
                            direction={point?.direction || "flat"}
                          />
                        </div>
                        <span className="sd-core-asof">
                          {observationTime(point?.asOf)}
                          {point?.status !== "fresh" && (
                            <span className="sd-warning">
                              {" "}
                              · {point ? statusNames[point.status] : "누락"}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <QualityStrip
                snapshot={snapshot}
                onSources={() => navigate("sources")}
              />
              <BriefingPanel
                key={snapshot.id}
                snapshot={snapshot}
                initialState={archive ? undefined : state.briefing}
                onSelect={select}
              />
              <div className="sd-workspace-grid">
                <MarketBoard
                  points={snapshot.marketPoints}
                  onSelect={select}
                  compact
                  watchlistSymbols={state.config.watchlist.map(
                    (point) => point.symbol,
                  )}
                />
                <NewsFeed
                  news={snapshot.news}
                  sources={snapshot.sources}
                  status={snapshot.quality.newsStatus}
                  compact
                  onExpand={() => navigate("news")}
                  onSources={() => navigate("sources")}
                />
              </div>
            </>
          ) : view === "macro" || view === "equities" ? (
            <>
              {view === "equities" && (
                <>
                  <div className="sd-inline-toolbar">
                    <span>
                      한국·미국 주식과 주요 ETF · 관심 종목은 별도로 관리
                    </span>
                    <button
                      className="sd-button secondary"
                      onClick={() => navigate("settings")}
                    >
                      <Icon name="settings" size={16} />
                      관심 종목 편집
                    </button>
                  </div>
                  <div
                    className="sd-filter-tabs"
                    role="group"
                    aria-label="종목 작업 보기"
                  >
                    <button
                      className={equityMode === "quotes" ? "is-active" : ""}
                      aria-pressed={equityMode === "quotes"}
                      onClick={() => setEquityMode("quotes")}
                    >
                      시세 탐색
                    </button>
                    <button
                      className={equityMode === "scores" ? "is-active" : ""}
                      aria-pressed={equityMode === "scores"}
                      onClick={() => setEquityMode("scores")}
                    >
                      전체 종목 평가{" "}
                      <span>{snapshot.screening?.scores.length || ""}</span>
                    </button>
                  </div>
                </>
              )}
              {view === "equities" && equityMode === "scores" ? (
                <ScoreExplorer
                  analysis={snapshot.screening}
                  points={snapshot.marketPoints}
                  onSelect={select}
                />
              ) : (
                <MarketBoard
                  key={view}
                  points={snapshot.marketPoints}
                  onSelect={select}
                  scope={view === "macro" ? "macro" : "equity"}
                  watchlistSymbols={state.config.watchlist.map(
                    (point) => point.symbol,
                  )}
                />
              )}
            </>
          ) : (
            <>
              <NewsFeed
                news={snapshot.news}
                sources={snapshot.sources}
                status={snapshot.quality.newsStatus}
                onSources={() => navigate("sources")}
              />
            </>
          )}
        </main>
        <footer className="sd-footer">
          <div>
            <span className="sd-footer-wordmark">
              SIGNAL DESK<span> / </span>MYBLOOMBERG
            </span>
            <span>개인용 로컬 시장 데스크</span>
          </div>
          <div>
            <span>모든 시각 KST</span>
            {snapshot && (
              <a
                href={`/api/snapshots?id=${encodeURIComponent(snapshot.id)}&download=1`}
              >
                <Icon name="download" size={13} />
                스냅샷 JSON
              </a>
            )}
            <button onClick={() => navigate("sources")}>
              출처 상태
              {sourceIssueCount > 0 && (
                <span className="sd-warning"> {sourceIssueCount}</span>
              )}
            </button>
          </div>
        </footer>
      </div>
      {detail && (
        <MarketDetail
          point={detail.point}
          sample={detail.sample}
          score={detail.score}
          screening={detail.screening}
          comparisonPoints={detail.comparisonPoints}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

export function SnapshotObservation({
  snapshot,
}: {
  snapshot: CollectionSnapshot;
}) {
  const moves = snapshot.marketPoints
    .filter(
      (point) =>
        point.value !== null &&
        point.changePercent !== null &&
        point.status !== "missing",
    )
    .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
    .slice(0, 2);
  return (
    <div className="sd-observation">
      <span className="sd-observation-label">주요 가격 변동</span>
      {moves.length ? (
        moves.map((point) => (
          <p key={point.id}>
            <strong>{point.label}</strong>
            <span className={`move-${point.direction}`}>
              {point.displayChange}
            </span>
            <span>{point.status === "stale" ? "지연 관측" : "전일 대비"}</span>
          </p>
        ))
      ) : (
        <p className="sd-observation-empty">
          비교할 수 있는 가격 변화가 없습니다. 데이터 출처를 확인해 주세요.
        </p>
      )}
      <small>등락률 절댓값순</small>
    </div>
  );
}
function QualityStrip({
  snapshot,
  onSources,
}: {
  snapshot: CollectionSnapshot;
  onSources: () => void;
}) {
  const quality = snapshot.quality;
  return (
    <section className="sd-quality-strip" aria-label="데이터 품질 요약">
      <div className="sd-quality-title">
        <span className="sd-eyebrow">DATA INTEGRITY</span>
        <strong>데이터의 상태</strong>
      </div>
      <dl>
        <div>
          <dt>
            <i className="sd-dot fresh" />
            정상
          </dt>
          <dd>{String(quality.fresh).padStart(2, "0")}</dd>
        </div>
        <div>
          <dt>
            <i className="sd-dot stale" />
            지연
          </dt>
          <dd className={quality.stale ? "sd-warning" : ""}>
            {String(quality.stale).padStart(2, "0")}
          </dd>
        </div>
        <div>
          <dt>
            <i className="sd-dot missing" />
            누락
          </dt>
          <dd className={quality.missing ? "sd-negative" : ""}>
            {String(quality.missing).padStart(2, "0")}
          </dd>
        </div>
        <div>
          <dt>뉴스</dt>
          <dd>
            {String(snapshot.news.length).padStart(2, "0")}
            <small>건</small>
          </dd>
        </div>
      </dl>
      <div className="sd-quality-detail">
        <p>
          {quality.missingCritical.length
            ? `핵심 누락: ${quality.missingCritical.join(", ")}`
            : quality.warnings[0] ||
              "공급자별 거래 시간과 갱신 주기를 기준으로 확인합니다."}
        </p>
        <button className="sd-text-link" onClick={onSources}>
          품질·출처 확인 <Icon name="arrow" size={14} />
        </button>
      </div>
    </section>
  );
}
function FirstRun({
  running,
  onCollect,
  onSample,
  onSettings,
}: {
  running: boolean;
  onCollect: () => void;
  onSample: () => void;
  onSettings: () => void;
}) {
  return (
    <section className="sd-first-run" aria-labelledby="first-run-title">
      <Icon name="macro" size={30} />
      <div>
        <h2 id="first-run-title">저장된 시장 데이터가 없습니다.</h2>
        <p>
          지수·환율·금리·원자재와 관심 종목 시세, 최근 24시간 뉴스를 수집합니다.
          API 키 없이 시작할 수 있으며 스냅샷은 이 PC에 저장됩니다.
        </p>
        <div className="sd-first-actions">
          <button
            className="sd-button primary"
            onClick={onCollect}
            disabled={running}
          >
            첫 시장 데이터 수집 <Icon name="arrow" size={16} />
          </button>
          <button
            className="sd-text-link"
            onClick={onSample}
            disabled={running}
          >
            먼저 샘플 둘러보기 <Icon name="arrow" size={14} />
          </button>
          <button className="sd-text-link" onClick={onSettings}>
            관심 종목 설정 <Icon name="settings" size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
