import { LocalStore } from "../src/lib/storage/store";
import { runBriefing } from "../src/lib/report/service";
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
const snapshot = await new LocalStore().getLatest();
if (!snapshot) throw new Error("먼저 시장 데이터를 수집하세요.");
console.log("[MyBloomberg] 수개월 이상 중장기 Codex 브리핑 생성");
const run = await runBriefing(snapshot.id);
console.log(JSON.stringify(run, null, 2));
if (run.stage === "failed") process.exitCode = 1;
