# MyBloomberg 로컬 프로토타입 설계

- 날짜: 2026-08-02
- 상태: 사용자 승인 완료
- 제품 이름: MyBloomberg / Signal Desk
- 대상 사용자: 소유자 1인
- 기본 시간대: `Asia/Seoul`

## 1. 제품 요약

MyBloomberg는 한국 투자자의 관점에서 글로벌 시장을 빠르게 파악하기 위한 개인용 로컬 웹 애플리케이션이다. 매주 월요일부터 금요일 오전 7시 30분에 무료 데이터 소스에서 시장 데이터와 최근 뉴스를 수집하고, 로컬 Codex 로그인 세션으로 모닝 리포트를 생성한 뒤 Signal Desk 대시보드와 Discord로 전달한다.

프로토타입은 추가 비용 0원을 목표로 한다. 별도의 OpenAI API 키, 유료 시세, 데이터베이스, 유료 서버를 사용하지 않는다. 자동 실행에는 Windows PC와 Codex 로그인 상태가 필요하다. PC가 꺼져 있거나 절전 상태에서 작업을 실행할 수 없으면 다음 로그인 후 누락된 작업을 한 번 실행한다.

## 2. 목표와 제외 범위

### 목표

- 한국·미국 지수, 환율, 미국 금리, 원자재, Bitcoin, 관심 종목을 한 화면에서 확인한다.
- 숫자, 뉴스, 경제 일정을 근거로 Codex가 구조화된 모닝 리포트를 작성한다.
- 사실, 출처의 주장, Codex의 해석을 구분한다.
- 데이터 누락이나 외부 서비스 장애가 있어도 마지막 정상 상태를 보존한다.
- Discord에서 핵심 요약을 바로 읽고 전체 Markdown 리포트를 내려받을 수 있다.
- 수동 실행과 평일 오전 7시 30분 자동 실행이 동일한 파이프라인을 사용한다.

### 프로토타입에서 제외

- 로그인, 권한 관리, 다중 사용자
- 클라우드 배포와 외부 공개 URL
- 관계형 데이터베이스
- 이메일 발송
- 유료 또는 거래소 라이선스 기반 실시간 시세
- 주문 실행, 증권사 연동, 포트폴리오 리밸런싱
- Codex가 독립적으로 내리는 매수·매도 명령
- 기사 전문의 영구 저장 또는 재게시

## 3. 사용자 경험

### 기본 흐름

1. Windows 작업 스케줄러가 평일 오전 7시 30분에 파이프라인을 실행한다.
2. 파이프라인이 시장 데이터, 경제 데이터, 최근 24시간 뉴스를 수집한다.
3. 입력값을 검증하고 날짜별 스냅샷을 저장한다.
4. Codex가 JSON Schema에 맞는 리포트를 생성한다.
5. JSON과 Markdown 리포트를 날짜별로 저장하고 `latest` 포인터를 갱신한다.
6. Discord에 요약 메시지와 Markdown 파일을 전송한다.
7. 사용자가 대시보드를 열면 마지막 성공 리포트와 데이터 상태가 즉시 보인다.

### 수동 흐름

대시보드의 `REGENERATE` 동작은 자동 실행과 같은 파이프라인을 호출한다. 실행 중에는 `collecting`, `validating`, `generating`, `notifying` 단계를 표시한다. 같은 입력 스냅샷에 대한 중복 클릭은 하나의 실행으로 합친다.

## 4. 시각 설계: Signal Desk

승인된 화면 방향은 실무용 금융 터미널을 현대적으로 재해석한 `Signal Desk`다.

### 시각 원칙

- 카드 모음 대신 하나로 이어진 분석 표면을 사용한다.
- 숫자 → Codex 해석 → 투자 신호 → 일정 순서로 시각적 위계를 만든다.
- 왼쪽 주황색 레일과 확신도 바를 제품의 고유한 시각적 서명으로 사용한다.
- 둥근 카드, 장식용 그라데이션, 과도한 그림자를 사용하지 않는다.
- 기본 배경은 잉크 블랙, 본문은 중성 회색, 주요 액센트는 시그널 오렌지 `#F59B00`이다.
- 상승·정상·하락은 색상뿐 아니라 부호와 텍스트로도 구분한다.
- 수치에는 고정폭 글꼴을, 헤드라인과 해설에는 가독성 높은 산세리프를 사용한다.

### 화면 구조

- 왼쪽 레일: Overview, Macro, Equities, Archive
- 상단 상태줄: 기준 시간, 로컬 에이전트 상태, 마지막 성공 실행
- 시세 테이프: 핵심 지표 6개
- 모닝 논지: 한 줄 헤드라인, 2~4문장 해설, 확신도
- Market Pulse: 성장주, 반도체, 원화 위험, 유동성, 종합 위험 수준
- Cross-asset Pressure: 최근 20영업일 신호 차트
- Signal Matrix: 금리곡선, 달러, 반도체 상대강도, 변동성
- On Deck: 관심 종목과 당일 경제 일정
- 상태바: 데이터 기준 시각, 지연 여부, 리포트 식별자

데스크톱에서는 비대칭 다열 레이아웃을 사용하고, 좁은 화면에서는 시세 테이프 → 모닝 논지 → Pulse → 차트 → 관심 종목 순서로 한 열에 쌓는다.

## 5. 기술 구조

하나의 Next.js + TypeScript 저장소로 구성하며 `pnpm`을 사용한다. 런타임은 Node.js 20 이상이다. Tailwind CSS는 토큰과 레이아웃 보조에 사용하되, Signal Desk의 핵심 표현은 명시적인 디자인 토큰과 컴포넌트 스타일로 관리한다.

### 모듈 경계

- `app`: 대시보드, 리포트 상세, 아카이브, 실행 상태 UI
- `components`: Signal Desk 전용 프레젠테이션 컴포넌트
- `lib/market-data`: 공급자별 응답을 공통 시장 모델로 변환
- `lib/news`: RSS와 GDELT 수집, 본문 임시 추출, 중복 제거, 관련도 계산
- `lib/report`: 입력 패키지 생성, Codex 실행, 스키마 검증, Markdown 렌더링
- `lib/storage`: 파일 기반 스냅샷, 리포트, 실행 상태 저장
- `lib/notifications`: Discord 페이로드와 첨부 파일 전송
- `scripts`: 자동 실행, 수동 점검, 작업 스케줄러 설치 보조

각 모듈은 공급자 응답 객체를 외부로 노출하지 않는다. UI와 리포트 생성기는 정규화된 도메인 모델만 소비한다.

## 6. 시장 데이터

### 기본 시장 범위

| 구분 | 표시 항목 | 초기 식별자 |
|---|---|---|
| 한국 지수 | KOSPI, KOSDAQ | `^KS11`, `^KQ11` |
| 미국 지수 | S&P 500, NASDAQ, Dow | `^GSPC`, `^IXIC`, `^DJI` |
| 환율 | USD/KRW | `KRW=X` |
| 미국 금리 | 2년, 10년 | FRED `DGS2`, `DGS10` |
| 원자재 | 금, WTI | `GC=F`, `CL=F` |
| 암호자산 | Bitcoin/USD | `BTC-USD` |
| 기본 관심 종목 | 삼성전자, SK하이닉스, NVIDIA, TSMC | `005930.KS`, `000660.KS`, `NVDA`, `TSM` |

관심 종목은 로컬 설정 파일에서 수정한다.

### 공급자

- 시장 시세: `yahoo-finance2` v4 계열을 `MarketDataProvider` 어댑터 뒤에서 사용한다.
- 미국 경제·금리: 무료 FRED API를 사용한다.
- 공급자별 원본 응답은 정규화 직후 폐기하고, 필요한 필드만 스냅샷에 저장한다.

Yahoo Finance 접근은 공식 개발자 API가 아니며 가용성과 응답 형식이 보장되지 않는다. 따라서 프로토타입에만 사용하고 공급자 교체가 가능한 인터페이스를 유지한다.

### 정규화 모델

```ts
type DataStatus = "fresh" | "stale" | "missing";

interface MarketPoint {
  symbol: string;
  label: string;
  assetClass: "index" | "equity" | "fx" | "rate" | "commodity" | "crypto";
  value: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketState: "open" | "closed" | "pre" | "post" | "unknown";
  asOf: string | null;
  source: string;
  status: DataStatus;
}
```

`fresh` 여부는 단순 경과 시간이 아니라 자산별 거래 세션과 발표 주기를 기준으로 판정한다. 시장이 열려 있을 때 예상 갱신 주기의 두 배 이상 늦으면 `stale`이다. 시장이 닫혀 있을 때는 직전 정규장 종가를 다음 개장 전까지 정상값으로 취급한다. FRED 일별 자료는 최신 예정 발표분이 존재하면 정상값으로 취급한다.

## 7. 뉴스 수집

### 소스

- GDELT: 글로벌 시장·기업 뉴스 후보
- Federal Reserve RSS: 통화정책 발표와 연설
- 한국은행 RSS: 통화정책, 경제통계, 일일 국제금융 속보
- SEC RSS: 미국 기업과 시장 규제 발표

### 처리 규칙

1. 최근 24시간 항목만 수집한다.
2. 매크로, 한국 시장, 미국 시장, 원자재, 기본 관심 종목 쿼리로 분류한다.
3. 정규화된 URL과 제목 유사도로 중복을 제거한다.
4. 한 출처가 전체 결과를 지배하지 않도록 출처당 최대 6건을 허용한다.
5. 관련도 상위 최대 30건을 Codex 입력으로 사용한다.
6. 공개 접근 가능한 기사는 생성 시점에만 본문을 읽고, 기사당 최대 4,000자까지 메모리에 유지한다.
7. 유료벽, 로그인, 로봇 차단, 명시적 접근 거부가 있으면 제목과 공개 요약만 사용한다.
8. 디스크에는 제목, URL, 출처, 발행 시각, 공개 요약, 태그만 저장한다. 기사 전문은 저장하지 않는다.

## 8. 리포트 생성

### Codex 실행

파이프라인은 로컬 Codex CLI의 비대화형 실행을 사용한다. Codex에는 읽기 전용 샌드박스와 임시 세션을 부여하고, 시장 스냅샷과 뉴스 패키지를 표준 입력으로 전달한다. Codex는 파일을 직접 수정하지 않고 JSON Schema를 만족하는 결과만 표준 출력으로 반환한다. 호스트 파이프라인이 검증된 결과를 파일로 저장한다.

별도 OpenAI API 키와 API 과금은 사용하지 않는다. 현재 Codex 로그인 및 사용 중인 플랜의 한도는 적용된다.

### 출력 구조

```ts
interface MorningReport {
  id: string;
  generatedAt: string;
  dataAsOf: string;
  headline: string;
  marketRegime: {
    label: string;
    riskScore: number;
    confidence: number;
  };
  morningThesis: string;
  keyMoves: Array<{ instrument: string; observation: string; evidenceIds: string[] }>;
  newsDrivers: Array<{
    claim: string;
    attribution: string;
    interpretation: string;
    sourceIds: string[];
  }>;
  koreaOpenView: string;
  watchlistImpacts: Array<{ symbol: string; impact: string; conditions: string[] }>;
  economicCalendar: Array<{ time: string; event: string; relevance: string }>;
  risks: Array<{ level: "high" | "medium" | "low"; description: string; trigger: string }>;
  sources: Array<{ id: string; title: string; url: string | null; publishedAt: string | null }>;
  dataQuality: Array<{ area: string; status: DataStatus; note: string }>;
}
```

### 생성 규칙

- 모든 수치는 입력 스냅샷에 존재해야 한다.
- 사실, 출처의 주장, 모델의 해석을 별도 필드로 구분한다.
- 핵심 설명은 하나 이상의 데이터 또는 뉴스 식별자를 인용한다.
- 원인이 불확실하면 인과관계가 아니라 동시 움직임이나 가능성으로 표현한다.
- 출처가 충돌하면 한쪽을 확정하지 않고 양쪽을 요약한다.
- 누락과 지연은 `dataQuality`에 기록한다.
- 투자 명령 대신 시나리오, 위험, 확인 조건을 제시한다.

## 9. 파일 저장

프로토타입은 Git에 커밋하지 않는 로컬 `data` 디렉터리를 사용한다.

```text
data/
  snapshots/2026-08-03/073000.json
  reports/2026-08-03/073212.json
  reports/2026-08-03/073212.md
  reports/2026-08-03/latest.json
  runs/2026-08-03/073000.json
```

리포트는 덮어쓰지 않는다. `latest.json`은 가장 최근 성공 리포트의 상대 경로와 식별자만 보관한다. 실패한 실행은 `runs`에 기록하지만 성공 포인터를 변경하지 않는다.

## 10. Discord 알림

Discord 웹훅에는 다음 정보를 보낸다.

- 제품명과 리포트 식별자
- 헤드라인
- 핵심 움직임 최대 5개
- 오늘의 주요 일정 최대 3개
- 위험 점수와 데이터 기준 시각
- `NEWS DEGRADED`, `STALE DATA` 등 품질 배지
- 전체 Markdown 리포트 첨부
- 로컬 대시보드 주소와 `해당 PC에서만 열림` 안내

웹훅 URL은 `.env.local`의 `DISCORD_WEBHOOK_URL`에만 저장하고 로그에서 마스킹한다. 무료 FRED API 키도 같은 파일의 `FRED_API_KEY`로 관리한다. 실제 `.env*`와 로컬 `data/`는 `.gitignore`로 제외하고, 값이 없는 `.env.example`만 저장소에 포함한다.

## 11. 예약 실행

- 스케줄: 월요일~금요일 오전 7시 30분, `Asia/Seoul`
- 실행기: Windows 작업 스케줄러
- 주말: 자동 실행하지 않으며 수동 생성은 허용한다.
- 공휴일: 프로토타입에서는 자동 판정하지 않는다.
- 누락 실행: 예약 시각에 PC가 실행되지 않았다면 다음 로그인 후 한 번 실행한다.
- 중복 방지: 같은 날짜·실행 유형의 활성 잠금이 있으면 두 번째 실행을 시작하지 않는다.

## 12. 오류 처리

- 시세 수집은 일시적 오류에 대해 최대 2회 재시도한다.
- 재시도 후에도 실패하면 마지막 정상값을 사용하고 `stale`로 표시한다.
- 핵심 항목인 미국 지수, USD/KRW, 미국 10년물 중 2개 이상이 누락되면 정상 리포트를 만들지 않고 장애 알림만 보낸다.
- 뉴스 수집이 전부 실패하면 시장 데이터 기반 리포트를 만들고 `NEWS DEGRADED`를 표시한다.
- Codex 결과가 스키마를 통과하지 못하면 동일 입력으로 한 번 교정 실행한다.
- 교정 실행도 실패하면 이전 성공 리포트를 유지하고 오류를 기록한다.
- Discord 전송 실패는 리포트 성공 여부와 분리한다. 리포트는 보존하고 `notificationStatus: failed`로 기록한다.
- 로그에는 API 키, 웹훅 URL, 기사 전문, Codex 인증 정보를 남기지 않는다.

## 13. 테스트 전략

### 단위 테스트

- 공급자 응답 정규화와 누락값 처리
- 거래 세션을 고려한 `fresh`/`stale` 판정
- 뉴스 URL 정규화, 제목 유사도 중복 제거, 출처별 상한
- 리포트 JSON Schema 검증
- Discord 페이로드 길이와 품질 배지
- 리포트 최신 포인터의 원자적 갱신

### 통합 테스트

- 고정된 시세·뉴스 fixture로 전체 파이프라인을 실행한다.
- 테스트용 Codex 어댑터가 유효한 결과, 잘못된 스키마, 실행 실패를 각각 반환하도록 한다.
- 외부 네트워크와 실제 Codex 로그인 없이 성공·부분 실패·완전 실패 경로를 재현한다.

### 화면 테스트

- 데스크톱과 모바일 Signal Desk 렌더링
- 정상, stale, missing, 생성 중, 리포트 없음 상태
- 아카이브 탐색과 이전 리포트 표시

### 실제 연결 점검

- 시장 데이터 공급자 한 번 호출
- FRED 한 번 호출
- 뉴스 소스별 한 번 호출
- 실제 Codex 리포트 한 번 생성
- Discord 테스트 메시지 한 번 전송

## 14. 완료 기준

- `pnpm dev`로 Signal Desk가 실행되고 마지막 성공 리포트를 표시한다.
- `pnpm pipeline:run` 한 번으로 수집, 검증, 생성, 저장, 알림 단계가 완료된다.
- `pnpm pipeline:dry-run`은 실제 Codex와 Discord 없이 fixture로 완료된다.
- `pnpm notify:test`로 Discord 연결을 독립적으로 검증할 수 있다.
- Windows 작업 스케줄러 설치 보조 스크립트가 평일 오전 7시 30분 작업을 만든다.
- 일부 데이터나 뉴스 소스가 실패해도 정의된 degraded 상태로 종료한다.
- 핵심 데이터가 부족하면 잘못된 정상 리포트를 생성하지 않는다.
- 비밀값과 로컬 데이터가 Git에 포함되지 않는다.
