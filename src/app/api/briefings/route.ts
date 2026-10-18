import { after } from "next/server";
import { localMutationError, readBody } from "@/lib/collection/api";
import { getBriefingState, prepareBriefing } from "@/lib/report/service";
import { briefingMarkdown } from "@/lib/report/storage";
import { LocalStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 700;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshotId = url.searchParams.get("snapshotId");
    const state = await getBriefingState(snapshotId, {
      fallback: url.searchParams.get("fallback") === "1",
    });
    if (
      url.searchParams.get("format") === "markdown" &&
      url.searchParams.get("download") === "1"
    ) {
      if (!state.report || (snapshotId && !state.matchesSnapshot))
        return Response.json(
          { error: "해당 스냅샷의 브리핑이 없습니다." },
          { status: 404 },
        );
      return new Response(briefingMarkdown(state.report), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="mybloomberg-briefing-${state.report.id}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "브리핑을 읽지 못했습니다. 식별자와 로컬 저장 파일을 확인하세요.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const rejection = localMutationError(request);
  if (rejection) return rejection;
  try {
    const body = await readBody(request);
    const snapshotId =
      typeof body.snapshotId === "string"
        ? body.snapshotId
        : (await new LocalStore().getLatest())?.id;
    if (!snapshotId)
      return Response.json(
        { error: "먼저 시장 데이터를 수집하세요." },
        { status: 400 },
      );
    const prepared = await prepareBriefing(snapshotId);
    if (prepared.execute)
      after(async () => {
        await prepared.execute!();
      });
    return Response.json({ run: prepared.run }, { status: 202 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && /스냅샷|데이터|브리핑/.test(error.message)
            ? error.message
            : "브리핑을 시작하지 못했습니다. 로컬 설정과 저장 폴더를 확인하세요.",
      },
      { status: 400 },
    );
  }
}
