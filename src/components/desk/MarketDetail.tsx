"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketPoint } from "@/lib/domain/market";
import type { InstrumentScore, ScreeningAnalysis } from "@/lib/domain/scoring";
import {
  AnnualFinancials,
  scoreNumber,
  ScoringDetails,
} from "./ScoringDetails";
import {
  assetNames,
  Icon,
  kst,
  marketStateName,
  observationTime,
  quoteUrl,
  statusNames,
} from "./desk-utils";

export function MarketDetail({
  point,
  sample,
  onClose,
  score,
  screening,
  comparisonPoints,
}: {
  point: MarketPoint;
  sample: boolean;
  onClose: () => void;
  score?: InstrumentScore;
  screening?: ScreeningAnalysis;
  comparisonPoints?: MarketPoint[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showValues, setShowValues] = useState(false);
  const [windowSize, setWindowSize] = useState(60);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const allHistory = (point.history || []).filter((entry) =>
    Number.isFinite(entry.value),
  );
  const history = allHistory.slice(-windowSize);
  const min = Math.min(...history.map((entry) => entry.value));
  const max = Math.max(...history.map((entry) => entry.value));
  const span = max - min || 1;
  const path = history
    .map(
      (entry, index) =>
        `${index ? "L" : "M"}${52 + (index / (history.length - 1)) * 600},${210 - ((entry.value - min) / span) * 180}`,
    )
    .join(" ");
  const format = (value: number) =>
    value.toLocaleString("en-US", {
      maximumFractionDigits: point.assetClass === "rate" ? 3 : 2,
    });
  return (
    <dialog
      ref={dialog}
      className="sd-detail"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="instrument-title"
    >
      <div className="sd-detail-inner">
        <header className="sd-detail-top">
          <span className="sd-eyebrow">
            INSTRUMENT / {assetNames[point.assetClass]}
          </span>
          <button
            type="button"
            className="sd-icon-button"
            aria-label="종목 상세 닫기"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {sample && (
          <div className="sd-inline-note">
            샘플 데이터 · 실제 시장 가격과 이력이 아닙니다.
          </div>
        )}
        <div className="sd-detail-title">
          <div>
            <p className="sd-symbol">{point.symbol}</p>
            <h2 id="instrument-title">{point.label}</h2>
          </div>
          <span className={`sd-data-status ${point.status}`}>
            {statusNames[point.status]}
          </span>
        </div>
        <div className="sd-detail-price">
          <strong>{point.displayValue}</strong>
          <span className={`move-${point.direction}`}>
            {point.displayChange}
          </span>
        </div>
        <p className="sd-detail-time">
          {observationTime(point.asOf, true)}
          {point.assetClass !== "rate" &&
            ` · ${marketStateName(point.marketState)}`}
        </p>
        {point.assetClass === "equity" &&
          (score ? (
            <details className="sd-detail-scoring" open>
              <summary>
                균형형 개별 평가 · {scoreNumber(score.totalScore)} /100
              </summary>
              <ScoringDetails
                score={score}
                analysis={screening}
                points={comparisonPoints}
              />
            </details>
          ) : (
            <p className="sd-legacy-scoring">
              이전 분석 · 고정 점수 기준 미적용
            </p>
          ))}
        <section className="sd-history-chart" aria-labelledby="chart-title">
          <div className="sd-panel-heading">
            <h3 id="chart-title">가격의 흐름</h3>
            <span>
              {history.length ? `${history.length}개 관측값` : "이력 없음"}
            </span>
          </div>
          {allHistory.length > 20 && (
            <div
              className="sd-chart-windows"
              role="group"
              aria-label="가격 이력 기간"
            >
              {[
                [20, "20 관측"],
                [60, "60 관측"],
                [252, "전체 이력"],
              ]
                .filter(
                  ([size]) => Number(size) <= 60 || allHistory.length > 60,
                )
                .map(([size, label]) => (
                  <button
                    key={size}
                    className={windowSize === size ? "is-active" : ""}
                    aria-pressed={windowSize === size}
                    onClick={() => setWindowSize(Number(size))}
                  >
                    {label}
                  </button>
                ))}
            </div>
          )}
          {history.length > 1 ? (
            <>
              <svg
                viewBox="0 0 680 248"
                role="img"
                aria-label={`${point.label} ${history.length}개 관측값 가격 이력. 최저 ${format(min)}, 최고 ${format(max)}.`}
              >
                {[0, 1, 2, 3].map((line) => (
                  <g key={line}>
                    <line
                      x1="52"
                      x2="652"
                      y1={30 + line * 60}
                      y2={30 + line * 60}
                      className="sd-chart-grid"
                    />
                    <text x="44" y={34 + line * 60} textAnchor="end">
                      {format(max - (line / 3) * span)}
                    </text>
                  </g>
                ))}
                <path
                  d={path}
                  fill="none"
                  stroke="var(--orange)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text x="52" y="238">
                  {kst(history[0].time, true).split(" ").slice(0, 2).join(" ")}
                </text>
                <text x="652" y="238" textAnchor="end">
                  {kst(history.at(-1)?.time, true)
                    .split(" ")
                    .slice(0, 2)
                    .join(" ")}
                </text>
              </svg>
              <div className="sd-chart-range">
                <span>
                  저점 <strong>{format(min)}</strong>
                </span>
                <span>
                  고점 <strong>{format(max)}</strong>
                </span>
              </div>
            </>
          ) : (
            <div className="sd-empty-small">
              <Icon name="macro" size={28} />
              <p>이 공급자의 가격 이력을 받지 못했습니다.</p>
              <span>현재 관측값은 위에서 확인할 수 있습니다.</span>
            </div>
          )}
        </section>
        {point.assetClass === "equity" && (
          <>
            <Fundamentals point={point} />
            {point.instrumentType !== "etf" && (
              <AnnualFinancials history={point.fundamentals?.history} />
            )}
          </>
        )}
        <dl className="sd-detail-facts">
          <div>
            <dt>데이터 공급자</dt>
            <dd>{point.source}</dd>
          </div>
          <div>
            <dt>기준 통화 / 단위</dt>
            <dd>
              {point.currency || (point.assetClass === "rate" ? "%" : "지수")}
            </dd>
          </div>
          <div>
            <dt>갱신 상태</dt>
            <dd className={point.status === "fresh" ? "" : "sd-warning"}>
              {point.freshnessReason ||
                (point.status === "fresh"
                  ? "예상 갱신 주기 내 관측값"
                  : point.status === "stale"
                    ? "이전 관측값입니다. 공급자 상태를 확인해 주세요."
                    : "가격을 수집하지 못했습니다.")}
            </dd>
          </div>
        </dl>
        <div className="sd-detail-actions">
          <a
            href={quoteUrl(point)}
            target="_blank"
            rel="noreferrer"
            className="sd-text-link"
          >
            원본 데이터 확인 <Icon name="external" size={14} />
          </a>
          {history.length > 0 && (
            <button
              className="sd-text-link"
              onClick={() => setShowValues(!showValues)}
              aria-expanded={showValues}
            >
              {showValues ? "관측값 접기" : "관측값 표로 보기"}
            </button>
          )}
        </div>
        {showValues && (
          <div className="sd-history-table">
            <table>
              <caption className="sr-only">{point.label} 가격 이력</caption>
              <thead>
                <tr>
                  <th>기준일 / 기준 시각</th>
                  <th>관측값</th>
                </tr>
              </thead>
              <tbody>
                {history.toReversed().map((entry, index) => (
                  <tr key={`${entry.time}-${index}`}>
                    <td>{observationTime(entry.time, true)}</td>
                    <td>{format(entry.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </dialog>
  );
}

export function Fundamentals({ point }: { point: MarketPoint }) {
  const data = point.fundamentals;
  const format = (
    value: number | null | undefined,
    kind: "ratio" | "percent" | "debt" | "money" | "cash" | "price" = "ratio",
  ) => {
    if (value === null || value === undefined || !Number.isFinite(value))
      return "—";
    if (kind === "percent")
      return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
    if (kind === "debt")
      return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    if (kind === "money" || kind === "cash")
      return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)} ${kind === "cash" ? data?.financialCurrency || "" : point.currency || ""}`.trim();
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${kind === "ratio" ? "×" : ""}`;
  };
  const metrics =
    point.instrumentType === "etf"
      ? [
          ["연간 운용 보수", format(data?.expenseRatio, "percent")],
          ["분배·배당 수익률", format(data?.dividendYield, "percent")],
          ["후행 PER", format(data?.trailingPE)],
          ["PBR", format(data?.priceToBook)],
        ]
      : [
          ["후행 PER", format(data?.trailingPE)],
          ["예상 PER", format(data?.forwardPE)],
          ["PBR", format(data?.priceToBook)],
          ["시가총액", format(data?.marketCap, "money")],
          ["매출 성장률", format(data?.revenueGrowth, "percent")],
          ["이익 성장률", format(data?.earningsGrowth, "percent")],
          ["순이익률", format(data?.profitMargins, "percent")],
          ["ROE", format(data?.returnOnEquity, "percent")],
          ["부채 / 자본", format(data?.debtToEquity, "debt")],
          ["잉여현금흐름", format(data?.freeCashflow, "cash")],
          ["배당 수익률", format(data?.dividendYield, "percent")],
        ];
  const hasMetric = metrics.some(([, value]) => value !== "—");
  return (
    <section className="sd-fundamentals" aria-labelledby="fundamentals-heading">
      <div className="sd-panel-heading">
        <h3 id="fundamentals-heading">
          {point.instrumentType === "etf"
            ? "ETF 보유 비용과 지표"
            : "중장기 재무·밸류에이션"}
        </h3>
        <span className={`sd-status-text ${data?.status || "missing"}`}>
          {data ? statusNames[data.status] : "미수집"}
        </span>
      </div>
      {data ? (
        <>
          <div className="sd-fundamental-meta">
            <span>
              재무 기준일 <strong>{data.periodEnd || "제공되지 않음"}</strong>
            </span>
            <span>
              재무 통화{" "}
              <strong>{data.financialCurrency || "제공되지 않음"}</strong>
            </span>
            <span>수집 {observationTime(data.fetchedAt, true)}</span>
            <span>출처 {data.source}</span>
          </div>
          {hasMetric ? (
            <dl className="sd-metrics-grid">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={value === "—" ? "is-missing" : ""}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="sd-fundamental-empty">
              공급자가 이 종목의 재무 수치를 제공하지 않았습니다. 값이 없는
              항목은 0으로 대체하지 않습니다.
            </p>
          )}
          {(data.fiftyTwoWeekLow !== null ||
            data.fiftyTwoWeekHigh !== null) && (
            <div className="sd-week-range">
              <span>52주 관측 범위</span>
              <strong>
                {format(data.fiftyTwoWeekLow, "price")} <span>—</span>{" "}
                {format(data.fiftyTwoWeekHigh, "price")}
              </strong>
              <small>{point.currency}</small>
            </div>
          )}
          <p className="sd-fundamental-note">
            {data.note ||
              "재무 지표는 발표 시점과 공급자 갱신 시점에 차이가 있을 수 있습니다."}
          </p>
        </>
      ) : (
        <p className="sd-fundamental-empty">
          이 스냅샷에는 재무 데이터가 없습니다. 시장 데이터를 다시 수집하면
          공급자가 제공하는 지표를 함께 확인할 수 있습니다.
        </p>
      )}
    </section>
  );
}
