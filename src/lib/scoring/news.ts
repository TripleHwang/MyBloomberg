import type { CollectionSnapshot, NewsItem } from "../domain/collection";
import type { MarketPoint } from "../domain/market";
import type { NewsContribution, NewsImpact } from "../domain/scoring";
import { compare, round } from "./financials";

const aliases: Record<string, string[]> = {
  "005930.KS": ["삼성전자", "samsung electronics"],
  "000660.KS": ["sk하이닉스", "sk hynix"],
  "005380.KS": ["현대차", "현대자동차", "hyundai motor"],
  "000270.KS": ["기아", "kia"],
  "035420.KS": ["네이버", "naver"],
  "035720.KS": ["카카오", "kakao"],
  "051910.KS": ["lg화학", "lg chem"],
  "006400.KS": ["삼성sdi", "samsung sdi"],
  "005490.KS": ["포스코홀딩스", "posco holdings"],
  "068270.KS": ["셀트리온", "celltrion"],
  "207940.KS": ["삼성바이오로직스", "samsung biologics"],
  "105560.KS": ["kb금융", "kb financial"],
  "055550.KS": ["신한지주", "신한금융", "shinhan financial"],
  "086790.KS": ["하나금융", "hana financial"],
  "012330.KS": ["현대모비스", "hyundai mobis"],
  "066570.KS": ["lg전자", "lg electronics"],
  "028260.KS": ["삼성물산", "samsung c&t"],
  "015760.KS": ["한국전력", "kepco"],
  "034020.KS": ["두산에너빌리티", "doosan enerbility"],
  "009540.KS": ["hd한국조선해양", "hd korea shipbuilding"],
  "329180.KS": ["hd현대중공업", "hd hyundai heavy"],
  "000810.KS": ["삼성화재", "samsung fire"],
  AAPL: ["apple", "애플"],
  MSFT: ["microsoft", "마이크로소프트"],
  NVDA: ["nvidia", "엔비디아"],
  GOOGL: ["alphabet", "google", "알파벳", "구글"],
  AMZN: ["amazon", "아마존"],
  META: ["meta platforms", "메타", "meta"],
  TSLA: ["tesla", "테슬라"],
  AVGO: ["broadcom", "브로드컴"],
  AMD: ["advanced micro devices", "amd"],
  TSM: ["tsmc", "taiwan semiconductor", "대만반도체"],
  ASML: ["asml"],
  ORCL: ["oracle", "오라클"],
  CRM: ["salesforce", "세일즈포스"],
  PLTR: ["palantir", "팔란티어"],
  JPM: ["jpmorgan", "jp morgan", "jp모건"],
  BAC: ["bank of america", "뱅크오브아메리카"],
  V: ["visa", "비자"],
  MA: ["mastercard", "마스터카드"],
  "BRK-B": ["berkshire hathaway", "버크셔"],
  JNJ: ["johnson & johnson", "존슨앤드존슨"],
  LLY: ["eli lilly", "일라이릴리"],
  UNH: ["unitedhealth", "유나이티드헬스"],
  WMT: ["walmart", "월마트"],
  COST: ["costco", "코스트코"],
  KO: ["coca-cola", "coca cola", "코카콜라"],
  PEP: ["pepsico", "펩시코"],
  XOM: ["exxon mobil", "exxonmobil", "엑슨모빌"],
  CVX: ["chevron", "셰브런"],
  CAT: ["caterpillar", "캐터필러"],
  NEE: ["nextera energy", "넥스트에라"],
};
const industryTerms: Record<string, string[]> = {
  반도체: ["semiconductor", "semiconductors", "반도체"],
  자동차: ["automaker", "automakers", "자동차 업계"],
  에너지: ["oil industry", "energy sector", "석유 업계"],
  금융: ["banking sector", "은행 업계"],
  헬스케어: ["pharmaceutical industry", "healthcare sector", "제약 업계"],
  기술: ["software industry", "소프트웨어 업계"],
};
const rules = [
  {
    id: "guidance-up",
    label: "연간 실적 전망 상향",
    points: 2,
    pattern:
      /(?:rais(?:e[sd]?|ing)|lift(?:s|ed)?)\s+(?:[\w-]+\s+){0,3}(?:guidance|forecast|outlook)|(?:연간|실적|매출|이익).{0,14}(?:전망|가이던스).{0,10}상향/i,
  },
  {
    id: "earnings-beat",
    label: "예상 대비 실적 상회",
    points: 1,
    pattern:
      /(?:earnings|profit|revenue).{0,30}(?:beat|exceed|above expectations)|beat(?:s)?\s+(?:earnings|estimates)|(?:실적|매출|이익).{0,20}(?:예상|전망|컨센서스).{0,10}상회/i,
  },
  {
    id: "dividend-up",
    label: "배당 확대",
    points: 0.5,
    pattern:
      /(?:rais(?:e[sd]?|ing)|increas(?:e[sd]?|ing)).{0,20}dividend|배당.{0,12}(?:확대|증액|인상)/i,
  },
  {
    id: "credit-up",
    label: "신용등급 상향",
    points: 1,
    pattern:
      /credit rating.{0,20}upgrad|upgrad.{0,20}credit rating|신용등급.{0,12}상향/i,
  },
  {
    id: "guidance-down",
    label: "연간 실적 전망 하향",
    points: -2,
    pattern:
      /(?:cut(?:s)?|lower(?:s|ed)?|slash(?:es|ed)?).{0,25}(?:guidance|forecast|outlook)|(?:연간|실적|매출|이익).{0,14}(?:전망|가이던스).{0,10}하향/i,
  },
  {
    id: "earnings-miss",
    label: "예상 대비 실적 하회",
    points: -1,
    pattern:
      /(?:earnings|profit|revenue).{0,30}(?:miss|below expectations)|miss(?:es)?\s+(?:earnings|estimates)|(?:실적|매출|이익).{0,20}(?:예상|전망|컨센서스).{0,10}하회/i,
  },
  {
    id: "default",
    label: "채무불이행·파산 관련 보도",
    points: -3,
    pattern:
      /files? for bankruptcy|debt default|채무불이행|파산 신청|회생절차 신청/i,
  },
  {
    id: "accounting",
    label: "회계 오류·재작성 관련 보도",
    points: -2,
    pattern:
      /accounting fraud|financial restatement|회계 부정|회계 오류|재무제표 재작성/i,
  },
  {
    id: "dividend-down",
    label: "배당 축소",
    points: -0.5,
    pattern:
      /(?:cut(?:s)?|suspend(?:s|ed)?).{0,15}dividend|배당.{0,12}(?:삭감|중단|축소)/i,
  },
];
const trusted = [
  "cnbc.com",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "federalreserve.gov",
  "sec.gov",
  "bok.or.kr",
  "yna.co.kr",
  "yonhapnews.co.kr",
  "hankyung.com",
  "mk.co.kr",
];
const normalized = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
function hasTerm(text: string, term: string) {
  const token = normalized(term),
    at = text.indexOf(token);
  if (at < 0) return false;
  if (/[가-힣]/.test(token)) return true;
  const left = text[at - 1],
    right = text[at + token.length];
  return (
    (!left || !/[a-z0-9]/.test(left)) && (!right || !/[a-z0-9]/.test(right))
  );
}
function sourceTrusted(item: NewsItem) {
  try {
    const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "");
    return trusted.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
export function fitNewsContributions(
  items: NewsContribution[],
  target: number,
) {
  const sum = items.reduce((total, item) => total + item.contribution, 0);
  if (!sum) return;
  for (const item of items)
    item.contribution = round((item.contribution * target) / sum);
  const remainder = round(
    target - items.reduce((total, item) => total + item.contribution, 0),
  );
  const largest = [...items].sort(
    (a, b) =>
      Math.abs(b.contribution) - Math.abs(a.contribution) ||
      compare(a.url, b.url),
  )[0];
  if (largest) largest.contribution = round(largest.contribution + remainder);
}

export function newsImpact(
  point: MarketPoint,
  snapshot: CollectionSnapshot,
): NewsImpact {
  const at = Date.parse(snapshot.collectedAt);
  const items: NewsContribution[] = [];
  for (const article of [...snapshot.news].sort(
    (a, b) => compare(a.url, b.url) || compare(a.id, b.id),
  )) {
    const date = Date.parse(article.publishedAt);
    if (!Number.isFinite(date) || date > at || at - date > 24 * 3_600_000)
      continue;
    const text = normalized(`${article.title} ${article.summary}`);
    const companyTerms =
      point.instrumentType === "etf"
        ? [point.symbol, point.label]
        : (aliases[point.symbol] ?? [point.label]);
    const direct = companyTerms.filter(
      (term) => term.length >= 2 && hasTerm(text, term),
    );
    const industry = (industryTerms[point.sector ?? ""] ?? []).filter((term) =>
      hasTerm(text, term),
    );
    if (!direct.length && !industry.length) continue;
    const etfRules = [
      {
        id: "fund-fee-down",
        label: "ETF 보수 인하",
        points: 1,
        pattern:
          /expense ratio.{0,15}(?:cut|reduc)|(?:cut|reduc).{0,20}(?:expense ratio|fund fee)|(?:보수|총비용).{0,10}인하/i,
      },
      {
        id: "fund-fee-up",
        label: "ETF 보수 인상",
        points: -1,
        pattern:
          /expense ratio.{0,15}(?:rais|increas)|(?:보수|총비용).{0,10}인상/i,
      },
      {
        id: "fund-close",
        label: "ETF 청산 발표",
        points: -2,
        pattern:
          /fund liquidation|etf.{0,12}(?:clos|liquidat)|(?:상장폐지|청산).{0,10}etf|etf.{0,10}(?:상장폐지|청산)/i,
      },
    ];
    const hits = (point.instrumentType === "etf" ? etfRules : rules).filter(
      (rule) => rule.pattern.test(text),
    );
    const sectorUp =
      /(?:remain solid|strong demand|demand growth|견조한 수요|수요 증가|업황 개선)/i.test(
        text,
      );
    const sectorDown =
      /(?:weak demand|demand slump|수요 둔화|수요 감소|업황 악화)/i.test(text);
    const uncertain =
      /\b(?:not|denies|denied|rumou?r|may|could|considering)\b|가능성|부인|루머|소문|파산 회피|파산 방지|조사 종결/i.test(
        text,
      );
    const positive =
      hits.some((rule) => rule.points > 0) || (industry.length > 0 && sectorUp);
    const negative =
      hits.some((rule) => rule.points < 0) ||
      (industry.length > 0 && sectorDown);
    const mixed = positive && negative;
    const strongest = [...hits].sort(
      (a, b) => Math.abs(b.points) - Math.abs(a.points) || compare(a.id, b.id),
    )[0];
    const match = direct.length ? "company" : "industry";
    const untrusted = !sourceTrusted(article);
    const raw =
      uncertain || mixed || untrusted
        ? 0
        : match === "company"
          ? (strongest?.points ?? 0)
          : positive
            ? 0.25
            : negative
              ? -0.25
              : 0;
    const explanation = untrusted
      ? "연결은 확인했지만 점수 적용 대상 출처 목록에 없어 0점입니다."
      : uncertain
        ? "조건부·부정·부인 표현이 있어 제목·요약만으로 방향을 확정하지 않고 0점 처리했습니다."
        : mixed
          ? "긍정·부정 사건이 함께 있어 자동 방향 판정을 보류했습니다."
          : raw === 0
            ? "종목·업종 연결은 확인했지만 정의된 중장기 실적 사건이 없어 0점입니다."
            : match === "industry"
              ? "업종 전망에 관한 간접 연결입니다. 개별 기업의 이익 변화를 확인하지 않아 ±0.25점만 반영합니다."
              : `${strongest!.label} 표현에 따른 고정 ${raw > 0 ? "+" : ""}${raw}점입니다. 기사 전문 확인이나 실적 추정치 재계산은 하지 않았습니다.`;
    items.push({
      newsId: article.id,
      title: article.title,
      source: article.source,
      url: article.url,
      publishedAt: article.publishedAt,
      match,
      matchedTerms: direct.length ? direct : industry,
      direction: mixed
        ? "mixed"
        : raw > 0
          ? "positive"
          : raw < 0
            ? "negative"
            : "neutral",
      ruleIds:
        match === "company"
          ? hits.map((rule) => rule.id).sort(compare)
          : [
              ...(positive ? ["industry-outlook-up"] : []),
              ...(negative ? ["industry-outlook-down"] : []),
            ],
      rawContribution: raw,
      contribution: raw,
      explanation,
    });
  }
  const claimed = new Set<string>();
  // One strongest contribution per event rule; repeated headlines never accumulate the same rule.
  for (const item of [...items].sort(
    (a, b) =>
      Math.abs(b.rawContribution) - Math.abs(a.rawContribution) ||
      compare(b.publishedAt, a.publishedAt) ||
      compare(a.url, b.url),
  )) {
    if (!item.rawContribution) continue;
    const key = `${item.match}:${item.ruleIds.join("|")}:${Math.sign(item.rawContribution)}`;
    if (claimed.has(key)) {
      item.contribution = 0;
      item.explanation +=
        " 같은 사건 유형의 중복 기사는 추가 가산하지 않습니다.";
    } else claimed.add(key);
  }
  let sum = round(items.reduce((value, item) => value + item.contribution, 0));
  if (Math.abs(sum) > 5) {
    sum = Math.sign(sum) * 5;
    fitNewsContributions(items, sum);
  }
  const unavailable = snapshot.quality.newsStatus === "unavailable";
  return {
    adjustment: sum,
    status: items.length ? "matched" : unavailable ? "unavailable" : "no-match",
    beforeAction: "watch",
    changedAction: false,
    items,
    notes: [
      "고정 회사명·업종 연결과 사건 표현 규칙을 사용합니다. 키워드 휴리스틱이며 사실 확인·감정 분석 모형의 검증된 예측값이 아닙니다.",
      "기업 직접 사건은 ±0.5~3점, 업종 간접 사건은 ±0.25점, 전체 순조정은 ±5점 이내입니다. 같은 사건 표현 중복과 조건부·상충 표현은 가산을 제한합니다.",
      "뉴스 점수 0은 중립적 전망이나 위험 부재를 뜻하지 않습니다. 관련 기사 부족·분류 보류·소스 실패일 수 있습니다.",
      ...(snapshot.quality.newsStatus !== "ok"
        ? [
            "일부 또는 전체 뉴스 공급자가 실패했습니다. 현재 수집한 기사에 한해서만 반영했습니다.",
          ]
        : []),
    ],
  };
}
