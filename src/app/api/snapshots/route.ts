import { LocalStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const store = new LocalStore();
  try {
    if (!id) return Response.json(await store.listSnapshots());
    const snapshot = await store.getSnapshot(id);
    if (!snapshot)
      return Response.json(
        { error: "저장된 스냅샷을 찾을 수 없습니다." },
        { status: 404 },
      );
    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
        ...(url.searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="mybloomberg-${snapshot.id}.json"`,
            }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { error: "스냅샷 식별자 또는 저장 파일을 확인하세요." },
      { status: 400 },
    );
  }
}
