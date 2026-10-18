import { runCollection } from "../src/lib/collection/pipeline";
import { runBriefing } from "../src/lib/report/service";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("환경 설정 파일을 읽지 못했습니다.");
  }
}
const mode = process.argv.includes("--sample") ? "sample" : "live";
console.log(
  `[MyBloomberg] ${mode === "sample" ? "SAMPLE · 네트워크 없는 가상 데이터" : "실제 시장 데이터"} 수집 시작`,
);
const run = await runCollection(mode);
console.log(JSON.stringify(run, null, 2));
if (run.stage === "failed") process.exitCode = 1;
if (
  run.stage === "completed" &&
  run.snapshotId &&
  !process.argv.includes("--no-briefing")
) {
  console.log("[MyBloomberg] 중장기 브리핑 생성 시작");
  const briefing = await runBriefing(run.snapshotId);
  console.log(JSON.stringify(briefing, null, 2));
  if (briefing.stage === "failed") process.exitCode = 1;
}
