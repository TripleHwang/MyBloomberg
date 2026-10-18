import { after } from "next/server";
import { localMutationError, readBody } from "@/lib/collection/api";
import { prepareCollection } from "@/lib/collection/pipeline";
import { runBriefing } from "@/lib/report/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(request: Request) {
  const rejection = localMutationError(request);
  if (rejection) return rejection;
  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return Response.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (body.mode !== "sample" && body.mode !== "live")
    return Response.json({ error: "수집 모드를 선택하세요." }, { status: 400 });
  try {
    const prepared = await prepareCollection(body.mode);
    if (prepared.execute)
      after(async () => {
        const run = await prepared.execute!();
        if (run.stage === "completed" && run.snapshotId)
          await runBriefing(run.snapshotId).catch(() => {});
      });
    return Response.json({ run: prepared.run }, { status: 202 });
  } catch {
    return Response.json(
      {
        error:
          "수집을 시작하지 못했습니다. 로컬 저장 폴더를 확인하고 다시 시도하세요.",
      },
      { status: 500 },
    );
  }
}
