"use client";

import { useId, useState } from "react";
import type { AssetClass, MarketPoint } from "@/lib/domain/market";
import type {
  CollectionSnapshot,
  DeskCollectionState,
  InstrumentDefinition,
  NewsItem,
  SnapshotSummary,
  SourceHealth,
} from "@/lib/domain/collection";
import {
  assetNames,
  fullKst,
  Icon,
  kst,
  marketStateName,
  observationTime,
  Sparkline,
  statusNames,
} from "./desk-utils";

export function PanelHeading({
  index,
  title,
  meta,
}: {
  index?: string;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="sd-panel-heading">
      <h2>
        {index && <span>{index}</span>}
        {title}
      </h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}

export function MarketBoard({
  points,
  onSelect,
  scope = "all",
  compact = false,
  watchlistSymbols = [],
}: {
  points: MarketPoint[];
  onSelect: (point: MarketPoint) => void;
  scope?: "all" | "macro" | "equity";
  compact?: boolean;
  watchlistSymbols?: string[];
}) {
  const [filter, setFilter] = useState<AssetClass | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"default" | "up" | "down">("default");
  const [expanded, setExpanded] = useState(false);
  const [universe, setUniverse] = useState<"all" | "watchlist">("all");
  const [region, setRegion] = useState("all");
  const [instrumentType, setInstrumentType] = useState("all");
  const [sector, setSector] = useState("all");
  const [page, setPage] = useState(1);
  const tableId = useId();
  const isWatched = (point: MarketPoint) =>
    point.isWatchlist ??
    (point.id.startsWith("watch-") || watchlistSymbols.includes(point.symbol));
  const scoped = points.filter((point) =>
    scope === "equity"
      ? point.assetClass === "equity"
      : scope === "macro"
        ? point.assetClass !== "equity"
        : true,
  );
  const filtered = scoped.filter(
    (point) =>
      (filter === "all" || filter === point.assetClass) &&
      (universe === "all" || isWatched(point)) &&
      (region === "all" ||
        (point.region || (/\.(KS|KQ)$/.test(point.symbol) ? "KR" : "US")) ===
          region) &&
      (instrumentType === "all" ||
        (point.instrumentType || "stock") === instrumentType) &&
      (sector === "all" || point.sector === sector) &&
      `${point.label} ${point.symbol} ${point.sector || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  if (sort !== "default")
    filtered.sort((a, b) => {
      if (a.changePercent === null) return b.changePercent === null ? 0 : 1;
      if (b.changePercent === null) return -1;
      return (a.changePercent - b.changePercent) * (sort === "up" ? -1 : 1);
    });
  const classes = [...new Set(scoped.map((point) => point.assetClass))];
  const pageSize = compact && !expanded ? 8 : 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const watchCount = scoped.filter(isWatched).length;
  function reset() {
    setQuery("");
    setFilter("all");
    setUniverse("all");
    setRegion("all");
    setInstrumentType("all");
    setSector("all");
    setPage(1);
  }
  return (
    <section
      className={`sd-board ${compact ? "is-compact" : ""}`}
      aria-labelledby="market-board-title"
    >
      <PanelHeading
        index="01"
        title={
          scope === "equity"
            ? "종목·ETF 탐색"
            : scope === "macro"
              ? "글로벌 매크로"
              : "시장 보드"
        }
        meta={`${scoped.length} INSTRUMENTS`}
      />
      {scope === "equity" && (
        <div className="sd-explorer-filters">
          <div className="sd-universe-tabs" role="group" aria-label="종목 범위">
            <button
              onClick={() => {
                setUniverse("all");
                setPage(1);
              }}
              aria-pressed={universe === "all"}
              className={universe === "all" ? "is-active" : ""}
            >
              전체 종목 <span>{scoped.length}</span>
            </button>
            <button
              onClick={() => {
                setUniverse("watchlist");
                setPage(1);
              }}
              aria-pressed={universe === "watchlist"}
              className={universe === "watchlist" ? "is-active" : ""}
            >
              관심 종목 <span>{watchCount}</span>
            </button>
          </div>
          <div className="sd-explorer-selects">
            <label>
              시장
              <select
                aria-label="종목 시장"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">전체 시장</option>
                <option value="KR">한국</option>
                <option value="US">미국</option>
              </select>
            </label>
            <label>
              종류
              <select
                aria-label="종목 종류"
                value={instrumentType}
                onChange={(e) => {
                  setInstrumentType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">주식 + ETF</option>
                <option value="stock">주식</option>
                <option value="etf">ETF</option>
              </select>
            </label>
            <label>
              섹터
              <select
                aria-label="종목 섹터"
                value={sector}
                onChange={(e) => {
                  setSector(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">전체 섹터</option>
                {[
                  ...new Set(
                    scoped.flatMap((point) =>
                      point.sector ? [point.sector] : [],
                    ),
                  ),
                ]
                  .sort()
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
          </div>
        </div>
      )}
      <div className="sd-board-tools">
        <label className="sd-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label="종목 검색"
            placeholder="종목명 또는 심볼 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="sd-sort">
          <span className="sr-only">시장 보드 정렬</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(1);
            }}
          >
            <option value="default">기본 순서</option>
            <option value="up">상승률순</option>
            <option value="down">하락률순</option>
          </select>
        </label>
      </div>
      {scope !== "equity" && (
        <div className="sd-filter-tabs" role="group" aria-label="자산 종류">
          <button
            className={filter === "all" ? "is-active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => {
              setFilter("all");
              setPage(1);
            }}
          >
            전체 <span>{scoped.length}</span>
          </button>
          {classes.map((type) => (
            <button
              key={type}
              className={filter === type ? "is-active" : ""}
              aria-pressed={filter === type}
              onClick={() => {
                setFilter(type);
                setPage(1);
              }}
            >
              {assetNames[type]}
            </button>
          ))}
        </div>
      )}
      {filtered.length ? (
        <div className="sd-market-table-wrap" id={tableId}>
          <table className="sd-market-table">
            <caption id="market-board-title" className="sr-only">
              시장 관측값. 종목을 선택하면 가격 이력과 상세 출처가 열립니다.
            </caption>
            <thead>
              <tr>
                <th>자산 / 심볼</th>
                <th>현재 관측값</th>
                <th>전일 대비</th>
                <th className="sd-extra-col">기준 시각 · KST</th>
                <th className="sd-source-col">출처 / 상태</th>
                <th className="sd-row-action">
                  <span className="sr-only">상세</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((point) => (
                <tr key={point.id} className={`sd-market-row ${point.status}`}>
                  <th scope="row">
                    <button
                      onClick={() => onSelect(point)}
                      className="sd-instrument-button"
                      aria-label={`${point.label} (${point.symbol}), ${statusNames[point.status]} 데이터 상세 보기`}
                    >
                      <strong>
                        {point.label}
                        {point.instrumentType === "etf" && (
                          <small className="sd-kind-tag">ETF</small>
                        )}
                      </strong>
                      <span>
                        {point.symbol}
                        <i className={`sd-dot ${point.status}`} />
                        <span className="sd-mobile-status">
                          {statusNames[point.status]}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="sd-number">
                    <strong>{point.displayValue}</strong>
                    <small>
                      {point.currency ||
                        (point.assetClass === "rate" ? "%" : "INDEX")}
                    </small>
                  </td>
                  <td className={`sd-change move-${point.direction}`}>
                    <span>{point.displayChange}</span>
                    {!compact && (
                      <Sparkline
                        values={(point.history || []).map((item) => item.value)}
                        direction={point.direction}
                      />
                    )}
                  </td>
                  <td className="sd-extra-col">
                    <span className="sd-asof">
                      {observationTime(point.asOf)}
                    </span>
                    <small>
                      {point.assetClass === "rate"
                        ? "일별 발표 자료"
                        : marketStateName(point.marketState)}
                    </small>
                  </td>
                  <td className="sd-source-col">
                    <span>{point.source}</span>
                    <small className={`sd-status-text ${point.status}`}>
                      {statusNames[point.status]}
                    </small>
                  </td>
                  <td className="sd-row-action">
                    <button
                      className="sd-icon-button"
                      aria-label={`${point.label} 상세 보기`}
                      onClick={() => onSelect(point)}
                    >
                      <Icon name="arrow" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sd-empty-small">
          <Icon name="search" size={28} />
          <h3>조건에 맞는 종목이 없습니다.</h3>
          <p>
            {scope === "equity" && !scoped.length
              ? "설정에서 관심 종목을 추가한 뒤 다시 수집해 주세요."
              : "검색어 또는 자산 필터를 바꿔보세요."}
          </p>
          {(query ||
            filter !== "all" ||
            universe !== "all" ||
            region !== "all" ||
            instrumentType !== "all" ||
            sector !== "all") && (
            <button className="sd-text-link" onClick={reset}>
              검색 조건 초기화 <Icon name="arrow" size={14} />
            </button>
          )}
        </div>
      )}
      {compact && filtered.length > 8 && (
        <button
          className="sd-board-expand"
          aria-expanded={expanded}
          aria-controls={tableId}
          onClick={() => {
            setExpanded(!expanded);
            setPage(1);
          }}
        >
          <span>
            {expanded
              ? "주요 8개로 접기"
              : `전체 ${filtered.length}개 종목 보기`}
          </span>
          <span>
            {expanded ? "COLLAPSE" : `+ ${filtered.length - shown.length} MORE`}
          </span>
          <Icon name="arrow" size={15} />
        </button>
      )}
      {(!compact || expanded) && pageCount > 1 && (
        <div className="sd-pagination" aria-label="종목 페이지">
          <span>
            {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filtered.length)} /{" "}
            {filtered.length}종목
          </span>
          <div>
            <button
              className="sd-button secondary"
              disabled={currentPage === 1}
              aria-label="이전 종목 페이지"
              onClick={() => setPage(currentPage - 1)}
            >
              이전
            </button>
            <span>
              {currentPage} / {pageCount}
            </span>
            <button
              className="sd-button secondary"
              disabled={currentPage === pageCount}
              aria-label="다음 종목 페이지"
              onClick={() => setPage(currentPage + 1)}
            >
              다음
            </button>
          </div>
        </div>
      )}
      <div className="sd-table-foot">
        <span>
          {shown.length} / {filtered.length} 종목 표시
        </span>
        <span>종목 선택 → 실제 이력과 데이터 상세</span>
      </div>
    </section>
  );
}

export function NewsFeed({
  news,
  sources,
  status,
  compact = false,
  onExpand,
  onSources,
}: {
  news: NewsItem[];
  sources: SourceHealth[];
  status: CollectionSnapshot["quality"]["newsStatus"];
  compact?: boolean;
  onExpand?: () => void;
  onSources?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("전체");
  const [provider, setProvider] = useState("전체 출처");
  const tags = [...new Set(news.flatMap((item) => item.tags))].slice(0, 8);
  const matches = news.filter(
    (item) =>
      (topic === "전체" || item.tags.includes(topic)) &&
      (provider === "전체 출처" || item.source === provider) &&
      `${item.title} ${item.summary} ${item.source}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const shown = compact ? matches.slice(0, 4) : matches;
  const newsSources = sources.filter((source) => source.kind === "news");
  const allFailed =
    status === "unavailable" ||
    (newsSources.length > 0 &&
      newsSources.every((source) => source.status !== "ok"));
  return (
    <section className={`sd-news ${compact ? "is-compact" : ""}`}>
      <PanelHeading
        index="02"
        title={compact ? "지금 읽을 뉴스" : "뉴스 리더"}
        meta={
          compact && onExpand ? (
            <button className="sd-text-link" onClick={onExpand}>
              모두 보기 <Icon name="arrow" size={14} />
            </button>
          ) : (
            `${news.length} ITEMS / 24H`
          )
        }
      />
      {!compact && (
        <>
          <div className="sd-board-tools">
            <label className="sd-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목, 주제, 출처 검색"
                aria-label="뉴스 검색"
              />
            </label>
            <label className="sd-sort">
              <span className="sr-only">뉴스 출처</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option>전체 출처</option>
                {[...new Set(news.map((item) => item.source))].map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sd-filter-tabs" role="group" aria-label="뉴스 주제">
            {["전체", ...tags].map((tag) => (
              <button
                className={topic === tag ? "is-active" : ""}
                key={tag}
                onClick={() => setTopic(tag)}
                aria-pressed={topic === tag}
              >
                {tag}
              </button>
            ))}
          </div>
        </>
      )}
      {status !== "ok" && (
        <div className="sd-news-warning">
          <Icon name="warning" size={15} />
          <span>
            {status === "unavailable"
              ? "뉴스를 수집하지 못했습니다. 공급자 상태를 확인해 주세요."
              : "일부 뉴스 소스가 응답하지 않았습니다. 수집된 기사만 표시합니다."}
          </span>
        </div>
      )}
      {shown.length ? (
        <ol className="sd-news-list">
          {shown.map((item, index) => (
            <li key={item.id}>
              <span className="sd-news-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <article>
                <div className="sd-news-meta">
                  <strong>{item.source}</strong>
                  <time dateTime={item.publishedAt}>
                    {item.timeKind === "discovered" ? "발견 " : "발행 "}
                    {kst(item.publishedAt, true)} KST
                  </time>
                </div>
                <h3>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title}
                    <Icon name="external" size={14} />
                    <span className="sr-only"> (새 탭에서 원문 열기)</span>
                  </a>
                </h3>
                {!compact && item.summary && <p>{item.summary}</p>}
                <div className="sd-news-tags">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sd-empty-small">
          <Icon name="news" size={28} />
          <h3>
            {news.length
              ? "검색 결과가 없습니다."
              : allFailed
                ? "뉴스 소스의 응답을 기다리고 있습니다."
                : "최근 24시간의 관련 뉴스가 없습니다."}
          </h3>
          <p>
            {news.length
              ? "다른 검색어나 주제를 선택해 보세요."
              : allFailed
                ? "출처 상태에서 연결 오류를 확인하고 다시 수집할 수 있습니다."
                : status === "degraded"
                  ? "응답한 소스에서 최근 24시간에 해당하는 기사를 찾지 못했습니다. 일부 소스는 연결 상태를 확인해야 합니다."
                  : "소스는 연결되었지만 수집 조건에 맞는 기사가 없었습니다."}
          </p>
          {news.length > 0 && (
            <button
              className="sd-text-link"
              onClick={() => {
                setQuery("");
                setTopic("전체");
                setProvider("전체 출처");
              }}
            >
              검색 조건 초기화
            </button>
          )}
          {!news.length && status !== "ok" && onSources && (
            <button className="sd-text-link" onClick={onSources}>
              출처 상태 확인 <Icon name="arrow" size={14} />
            </button>
          )}
        </div>
      )}
      <div className="sd-table-foot">
        <span>
          {compact ? "최근 24시간 · 수집 시점 기준" : `${shown.length}개 기사`}
        </span>
        <span>제목 선택 → 원문</span>
      </div>
    </section>
  );
}

export function SourcePanel({
  sources,
  fredConfigured,
  onSettings,
}: {
  sources: SourceHealth[];
  fredConfigured: boolean;
  onSettings: () => void;
}) {
  const healthy = sources.filter((source) => source.status === "ok").length;
  return (
    <section className="sd-sources">
      <PanelHeading
        index="03"
        title="데이터 출처와 연결 상태"
        meta={`${healthy} / ${sources.length} HEALTHY`}
      />
      <p className="sd-operational-note">
        공급자별 마지막 응답과 수집 결과입니다. 이전 정상값을 재사용하면 지연
        상태로 표시합니다.
      </p>
      {sources.length ? (
        <div className="sd-source-list">
          {sources.map((source) => (
            <article
              key={source.id}
              className={source.status !== "ok" ? "has-issue" : ""}
            >
              <div className="sd-source-name">
                <span className={`sd-source-indicator ${source.status}`} />
                <div>
                  <span className="sd-eyebrow">
                    {source.kind === "market" ? "MARKET DATA" : "NEWS FEED"}
                  </span>
                  <h3>{source.label}</h3>
                </div>
                <span className={`sd-source-result ${source.status}`}>
                  {source.status === "ok"
                    ? "정상 연결"
                    : source.status === "unconfigured"
                      ? "설정 필요"
                      : "연결 오류"}
                </span>
              </div>
              <p>{source.message}</p>
              <div className="sd-source-bottom">
                <span>
                  수집 <strong>{source.count}건</strong>
                </span>
                <time dateTime={source.checkedAt}>
                  {fullKst(source.checkedAt)} KST 확인
                </time>
                {source.status === "unconfigured" && (
                  <button className="sd-text-link" onClick={onSettings}>
                    설정 확인 <Icon name="arrow" size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="sd-empty-small">
          <Icon name="sources" size={32} />
          <h3>첫 수집 후 출처별 상태를 확인할 수 있습니다.</h3>
          <p>시세와 뉴스 공급자를 각각 확인하고 결과를 저장합니다.</p>
        </div>
      )}
      {!fredConfigured && (
        <div className="sd-provider-note">
          <Icon name="settings" size={20} />
          <p>
            <strong>
              미국 금리는 U.S. Treasury 공식 일별 자료를 사용합니다.
            </strong>
            <br />
            API 키 없이 수집할 수 있습니다. FRED 연결은 선택 사항입니다.
          </p>
          <button className="sd-text-link" onClick={onSettings}>
            설정 열기 <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
    </section>
  );
}

export function ArchiveView({
  history,
  selectedId,
  openingId,
  onSelect,
}: {
  history: SnapshotSummary[];
  selectedId?: string;
  openingId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState("all");
  const shown = history.filter(
    (snapshot) => mode === "all" || snapshot.mode === mode,
  );
  return (
    <section className="sd-archive">
      <PanelHeading
        title="스냅샷 아카이브"
        meta={`${history.length} SNAPSHOTS`}
      />
      <p className="sd-operational-note">
        수집 당시의 시세·뉴스·데이터 품질을 다시 열거나 JSON으로 내려받을 수
        있습니다.
      </p>
      <div
        className="sd-filter-tabs"
        role="group"
        aria-label="아카이브 데이터 종류"
      >
        {[
          ["all", "전체"],
          ["live", "실데이터"],
          ["sample", "샘플"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? "is-active" : ""}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="sd-archive-list">
          {shown.map((snapshot, index) => (
            <li
              key={snapshot.id}
              className={selectedId === snapshot.id ? "is-selected" : ""}
            >
              <span className="sd-archive-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <button
                className="sd-archive-open"
                onClick={() => onSelect(snapshot.id)}
                disabled={Boolean(openingId)}
              >
                <span className={`sd-mode-tag ${snapshot.mode}`}>
                  {snapshot.mode === "sample" ? "SAMPLE" : "LIVE"}
                </span>
                <strong>
                  {fullKst(snapshot.collectedAt)} <small>KST</small>
                </strong>
                <span className="sd-archive-counts">
                  정상 {snapshot.fresh} <i /> 지연 {snapshot.stale} <i /> 누락{" "}
                  {snapshot.missing} <i /> 뉴스 {snapshot.newsCount}
                </span>
              </button>
              <div className="sd-archive-right">
                <span>
                  {openingId === snapshot.id
                    ? "불러오는 중…"
                    : selectedId === snapshot.id
                      ? "현재 열람 중"
                      : snapshot.readyForReport
                        ? "입력 품질 충족"
                        : "데이터 확인 필요"}
                </span>
                <a
                  href={`/api/snapshots?id=${encodeURIComponent(snapshot.id)}&download=1`}
                  className="sd-icon-button"
                  aria-label={`${fullKst(snapshot.collectedAt)} 스냅샷 JSON 내려받기`}
                >
                  <Icon name="download" size={18} />
                </a>
                <button
                  className="sd-icon-button"
                  onClick={() => onSelect(snapshot.id)}
                  disabled={Boolean(openingId)}
                  aria-label={`${fullKst(snapshot.collectedAt)} 스냅샷 열기`}
                >
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sd-empty-small">
          <Icon name="archive" size={32} />
          <h3>
            {history.length
              ? "이 종류의 스냅샷이 없습니다."
              : "아직 보관된 스냅샷이 없습니다."}
          </h3>
          <p>시장을 한 번 수집하면 이곳에서 이전 상태를 다시 열 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

interface EditableInstrument {
  symbol: string;
  label: string;
  region: "KR" | "US";
}
export function SettingsView({
  config,
  onSaved,
}: {
  config: DeskCollectionState["config"];
  onSaved: (config: DeskCollectionState["config"]) => void;
}) {
  const normalize = (list: InstrumentDefinition[]): EditableInstrument[] =>
    list.map(({ symbol, label, region }) => ({
      symbol,
      label,
      region: region === "KR" ? "KR" : "US",
    }));
  const [rows, setRows] = useState<EditableInstrument[]>(() =>
    normalize(config.watchlist),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const dirty =
    JSON.stringify(rows) !== JSON.stringify(normalize(config.watchlist));
  function update(
    index: number,
    field: keyof EditableInstrument,
    value: string,
  ) {
    setRows(
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
    setNotice(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlist: rows.map((row) => ({
            ...row,
            symbol: row.symbol.trim().toUpperCase(),
            label: row.label.trim(),
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "관심 종목 설정을 저장하지 못했습니다.");
      onSaved(body);
      setRows(normalize(body.watchlist));
      setNotice({
        error: false,
        text: "관심 종목을 저장했습니다. 다음 수집부터 반영됩니다.",
      });
    } catch (error) {
      setNotice({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="sd-settings">
      <PanelHeading title="데스크 설정" meta="LOCAL CONFIGURATION" />
      <section className="sd-settings-section">
        <div className="sd-settings-description">
          <span className="sd-eyebrow">01 / WATCHLIST</span>
          <h2>관심 종목</h2>
          <p>
            한국과 미국 종목을 최대 20개까지 등록할 수 있습니다. Yahoo Finance
            심볼을 사용합니다.
          </p>
          <span className="sd-setting-example">한국 005930.KS · 미국 NVDA</span>
        </div>
        <form onSubmit={save} className="sd-watchlist-form">
          <div className="sd-watchlist-labels">
            <span>심볼</span>
            <span>표시 이름</span>
            <span>시장</span>
          </div>
          {rows.map((row, index) => (
            <div className="sd-watchlist-row" key={index}>
              <label>
                <span className="sr-only">관심 종목 {index + 1} 심볼</span>
                <input
                  value={row.symbol}
                  required
                  maxLength={30}
                  onChange={(e) => update(index, "symbol", e.target.value)}
                  placeholder="NVDA"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </label>
              <label>
                <span className="sr-only">관심 종목 {index + 1} 표시 이름</span>
                <input
                  value={row.label}
                  required
                  maxLength={60}
                  onChange={(e) => update(index, "label", e.target.value)}
                  placeholder="NVIDIA"
                />
              </label>
              <label>
                <span className="sr-only">관심 종목 {index + 1} 시장</span>
                <select
                  value={row.region}
                  onChange={(e) => update(index, "region", e.target.value)}
                >
                  <option value="US">미국</option>
                  <option value="KR">한국</option>
                </select>
              </label>
              <button
                type="button"
                className="sd-icon-button"
                aria-label={`${row.label || `관심 종목 ${index + 1}`} 삭제`}
                onClick={() => {
                  setRows(rows.filter((_, i) => i !== index));
                  setNotice(null);
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="sd-form-empty">
              등록한 관심 종목이 없습니다. 아래에서 첫 종목을 추가해 주세요.
            </p>
          )}
          <div className="sd-form-bottom">
            <button
              type="button"
              className="sd-text-link"
              disabled={rows.length >= 20 || saving}
              onClick={() =>
                setRows([...rows, { symbol: "", label: "", region: "US" }])
              }
            >
              <Icon name="plus" size={16} /> 종목 추가{" "}
              <span>{rows.length}/20</span>
            </button>
            <div>
              <button
                type="button"
                className="sd-button secondary"
                disabled={!dirty || saving}
                onClick={() => {
                  setRows(normalize(config.watchlist));
                  setNotice(null);
                }}
              >
                되돌리기
              </button>
              <button
                className="sd-button primary"
                disabled={!dirty || saving}
                type="submit"
              >
                {saving ? "저장 중…" : "변경사항 저장"}
              </button>
            </div>
          </div>
          {notice && (
            <p
              className={`sd-form-notice ${notice.error ? "is-error" : ""}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.text}
            </p>
          )}
        </form>
      </section>
      <section className="sd-settings-section">
        <div className="sd-settings-description">
          <span className="sd-eyebrow">02 / DATA PROVIDER</span>
          <h2>미국 금리 데이터</h2>
          <p>
            기본 공급자는 U.S. Treasury입니다. 별도 API 키 없이 미국 2년·10년
            금리를 수집합니다.
          </p>
        </div>
        <div className="sd-provider-config">
          <div className="sd-provider-title">
            <h3>{config.fredConfigured ? "FRED" : "U.S. Treasury"}</h3>
            <span className="sd-data-status fresh">
              {config.fredConfigured ? "FRED 키 설정됨" : "키 없이 사용 가능"}
            </span>
          </div>
          <p>
            현재{" "}
            {config.fredConfigured
              ? "FRED API"
              : "미 재무부 공식 일별 수익률 자료"}
            로 금리를 수집합니다. FRED로 전환하려면 API 키를 프로젝트의{" "}
            <code>.env.local</code>에 저장한 뒤 개발 서버를 다시 시작하세요.
            키는 브라우저로 전송하지 않습니다.
          </p>
          <pre>FRED_API_KEY=발급받은_키</pre>
          <a
            href="https://fred.stlouisfed.org/docs/api/api_key.html"
            target="_blank"
            rel="noreferrer"
            className="sd-text-link"
          >
            FRED 키 발급 안내 <Icon name="external" size={14} />
          </a>
        </div>
      </section>
    </div>
  );
}
