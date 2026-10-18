import { localMutationError, readBody } from "@/lib/collection/api";
import { LocalStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      watchlist: await new LocalStore().getWatchlist(),
      fredConfigured: Boolean(process.env.FRED_API_KEY?.trim()),
    });
  } catch {
    return Response.json(
      { error: "관심 종목 설정 파일을 읽지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const rejection = localMutationError(request);
  if (rejection) return rejection;
  let watchlist;
  try {
    const body = await readBody(request);
    watchlist = await new LocalStore().setWatchlist(body.watchlist);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          !/EACCES|EPERM|ENOENT|EISDIR/.test(error.message)
            ? error.message
            : "관심 종목을 저장하지 못했습니다. 로컬 저장 폴더를 확인하세요.",
      },
      { status: 400 },
    );
  }
  return Response.json({
    watchlist,
    fredConfigured: Boolean(process.env.FRED_API_KEY?.trim()),
  });
}
