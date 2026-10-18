import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { BriefingRun, MarketBriefing } from "../domain/briefing";
import { atomicJson, LocalStore } from "../storage/store";
import { presentBriefing } from "./presentation";

const validId = /^\d{4}-\d{2}-\d{2}_\d{9}_[a-f0-9]{8}$/;
async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function check(id: string) {
  if (!validId.test(id)) throw new Error("잘못된 브리핑 식별자입니다.");
  return id;
}

export function briefingMarkdown(report: MarketBriefing) {
  const lines = [
    `# ${report.headline}`,
    "",
    `- 기준: ${report.dataAsOf}`,
    `- 생성: ${report.generatedAt}`,
    `- 투자 기간: ${report.horizon}`,
    `- 모드: ${report.mode === "sample" ? "샘플 (가상 데이터)" : "실데이터 / Codex"}`,
    "",
    report.summary,
    "",
    "## 시장 해석",
  ];
  for (const view of report.marketView)
    lines.push(
      `### ${view.title}`,
      "",
      view.interpretation,
      `근거: ${view.evidenceIds.join(", ")}`,
      "",
    );
  lines.push(
    "## 중장기 매매 검토 후보",
    "",
    "매도·축소 후보는 보유 시 재검토 관점이며 보유 여부는 입력되지 않았습니다.",
    "",
  );
  if (report.screening) {
    lines.push(
      `- 고정 모형: ${report.screening.modelVersion} / ${report.screening.profile}`,
      `- 입력 지문: ${report.screening.inputHash}`,
      "",
      ...report.screening.notes.map((note) => `- ${note}`),
      "",
    );
  }
  for (const candidate of report.candidates) {
    lines.push(
      `### ${candidate.symbol} · ${{ buy: "매수 검토", sell: "매도·축소 검토", watch: "관찰" }[candidate.action]}`,
      "",
      candidate.thesis,
      ...candidate.reasons.map((reason) => `- 근거: ${reason}`),
      ...candidate.risks.map((risk) => `- 위험: ${risk}`),
      `- 진입 조건: ${candidate.entryCondition}`,
      `- 이탈·재검토 조건: ${candidate.exitCondition}`,
      `- 판단 무효화 조건: ${candidate.invalidation}`,
      `- 자료: ${candidate.evidenceIds.join(", ")}`,
      "",
    );
    const score = candidate.score;
    if (score) {
      lines.push(
        "#### 점수와 자료",
        "",
        `기본 ${score.baseScore ?? "산출 보류"} + 뉴스 ${score.news.adjustment} = 총점 ${score.totalScore ?? "산출 보류"} /100 · 자료 ${score.coverage}% · ${score.model}`,
        "",
      );
      for (const factor of score.components)
        lines.push(
          `- ${factor.label}: ${factor.points ?? "자료 없음"}/${factor.weight}점 (자료 ${factor.coverage}%)`,
          ...factor.metrics.map(
            (item) =>
              `  - ${item.label}: ${item.value ?? "미확인"} [${item.unit}], ${item.points ?? "보류"}/${item.maxPoints}점 · ${item.explanation}`,
          ),
        );
      lines.push(
        "",
        `- 동종 비교: ${score.peers.groupLabel}, 대상 외 ${score.peers.count}개`,
        ...score.peers.notes.map((note) => `- ${note}`),
        "",
        "#### 뉴스 기여도",
        "",
      );
      if (!score.news.items.length)
        lines.push(`- 연결 기사 없음 (${score.news.status}) · 뉴스 0점`);
      for (const item of score.news.items)
        lines.push(
          `- [${item.title}](${item.url}) · ${item.source} · ${item.publishedAt} · ${item.match === "company" ? "기업 직접" : "업종 간접"} · 원점수 ${item.rawContribution}, 적용 ${item.contribution}점 · ${item.explanation}`,
        );
      lines.push(
        ...score.news.notes.map((note) => `- ${note}`),
        "",
        ...score.blockers.map((note) => `- 분류 제한: ${note}`),
        "",
      );
    }
  }
  if (report.screening) {
    lines.push(
      "## 전체 종목 평가",
      "",
      "모형별 점수이며 서로 다른 모형을 합쳐 순위를 매기지 않습니다.",
      "",
      "| 종목 | 모형 | 기본 | 뉴스 | 총점 | 자료 | 분류 |",
      "|---|---|---:|---:|---:|---:|---|",
    );
    for (const score of report.screening.scores)
      lines.push(
        `| ${score.symbol} | ${score.model} | ${score.baseScore ?? "—"} | ${score.news.adjustment} | ${score.totalScore ?? "—"} | ${score.coverage}% | ${score.action} |`,
      );
    lines.push("");
  }
  lines.push(
    "## 한국 투자자 관점",
    "",
    report.koreaImplications,
    "",
    "## 환율",
    "",
    report.currencyView,
    "",
    "## 한계",
    ...report.limitations.map((item) => `- ${item}`),
    "",
    "## 근거 자료",
  );
  for (const evidence of report.evidence)
    lines.push(
      `- [${evidence.id}] ${evidence.label}: ${evidence.value} (${evidence.source}, ${evidence.asOf ?? "기준 시각 미확인"}, ${evidence.status})${evidence.url ? ` — ${evidence.url}` : ""}`,
    );
  return `${lines.join("\n")}\n`;
}

export class BriefingStore {
  constructor(readonly root = new LocalStore().root) {}
  async getForSnapshot(snapshotId: string) {
    const pointer = await json<{ id: string }>(
      path.join(this.root, "report-snapshots", `${check(snapshotId)}.json`),
    );
    return pointer ? this.getReport(pointer.id) : null;
  }
  async getReport(id: string) {
    const report = await json<MarketBriefing>(
      path.join(this.root, "reports", check(id).slice(0, 10), `${id}.json`),
    );
    return report ? presentBriefing(report) : null;
  }
  async getLatest(mode?: "live" | "sample") {
    const pointer = await json<{ id: string }>(
      path.join(
        this.root,
        mode ? `latest-report-${mode}.json` : "latest-report.json",
      ),
    );
    return pointer ? this.getReport(pointer.id) : null;
  }
  async save(report: MarketBriefing) {
    report = presentBriefing(report);
    const base = path.join(this.root, "reports", check(report.id).slice(0, 10));
    await mkdir(base, { recursive: true });
    await writeFile(
      path.join(base, `${report.id}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(base, `${report.id}.md`),
      briefingMarkdown(report),
      { encoding: "utf8", flag: "wx" },
    );
    await atomicJson(
      path.join(
        this.root,
        "report-snapshots",
        `${check(report.snapshotId)}.json`,
      ),
      { id: report.id },
    );
    await atomicJson(
      path.join(this.root, `latest-report-${report.mode}.json`),
      { id: report.id },
    );
    await atomicJson(path.join(this.root, "latest-report.json"), {
      id: report.id,
    });
  }
  async saveRun(run: BriefingRun) {
    await atomicJson(
      path.join(this.root, "briefing-runs", `${check(run.id)}.json`),
      run,
    );
    await atomicJson(path.join(this.root, "current-briefing-run.json"), run);
  }
  async getRun(): Promise<BriefingRun | null> {
    const run = await json<BriefingRun>(
      path.join(this.root, "current-briefing-run.json"),
    );
    if (
      run &&
      !["completed", "failed"].includes(run.stage) &&
      Date.now() - Date.parse(run.startedAt) > 12 * 60_000
    )
      return {
        ...run,
        stage: "failed",
        error: "이전 Codex 분석이 중단되었습니다. 다시 생성할 수 있습니다.",
      };
    return run;
  }
  async acquireLock(): Promise<(() => Promise<void>) | null> {
    const file = path.join(this.root, ".briefing.lock");
    await mkdir(this.root, { recursive: true });
    try {
      const handle = await open(file, "wx");
      await handle.close();
      return async () => {
        await unlink(file).catch(() => {});
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = await stat(file).catch(() => null);
      if (metadata && Date.now() - metadata.mtimeMs > 12 * 60_000) {
        const expired = `${file}.${randomBytes(4).toString("hex")}.expired`;
        try {
          await rename(file, expired);
          await unlink(expired);
        } catch {
          return null;
        }
        return this.acquireLock();
      }
      return null;
    }
  }
}
