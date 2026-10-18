import { getDeskState } from "@/lib/collection/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getDeskState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "로컬 데이터를 읽지 못했습니다. data 폴더의 설정과 파일을 확인하세요.",
      },
      { status: 500 },
    );
  }
}
