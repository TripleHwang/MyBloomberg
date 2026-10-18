export function localMutationError(request: Request): Response | null {
  const url = new URL(request.url);
  // Next's production Request URL can use localhost while the browser opened 127.0.0.1.
  // Validate the actual Host before using it to compare the browser's Origin.
  let publicUrl: URL;
  try {
    publicUrl = new URL(
      `${url.protocol}//${request.headers.get("host") || url.host}`,
    );
  } catch {
    return Response.json({ error: "잘못된 로컬 주소입니다." }, { status: 403 });
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname))
    return Response.json(
      { error: "이 작업은 로컬 PC에서만 사용할 수 있습니다." },
      { status: 403 },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== publicUrl.origin)
    return Response.json(
      { error: "다른 사이트에서 보낸 요청은 허용하지 않습니다." },
      { status: 403 },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  return null;
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 16_384) throw new Error("요청이 너무 큽니다.");
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("잘못된 요청입니다.");
  return value as Record<string, unknown>;
}
