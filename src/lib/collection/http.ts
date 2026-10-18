export type Fetcher = typeof fetch;

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`HTTP ${status}`);
  }
}

export async function retry<T>(
  operation: () => Promise<T>,
  retries = 2,
  delay = 350,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries) throw error;
      if (
        error instanceof ProviderHttpError &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      )
        throw error;
      if (
        error instanceof ProviderHttpError &&
        (error.retryAfterMs ?? 0) > 30_000
      )
        throw error;
      const wait =
        error instanceof ProviderHttpError && error.status === 429
          ? Math.max(5_100, error.retryAfterMs ?? 0)
          : delay * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export async function fetchText(
  url: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "MyBloomberg/0.2 personal market research",
      Accept: "application/json, application/xml, text/xml, text/csv, */*",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(seconds)
      ? seconds * 1_000
      : retryAfter && Number.isFinite(Date.parse(retryAfter))
        ? Math.max(0, Date.parse(retryAfter) - Date.now())
        : null;
    await response.body?.cancel();
    throw new ProviderHttpError(response.status, retryAfterMs);
  }
  if (Number(response.headers.get("content-length")) > 4_000_000)
    throw new Error("Response too large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4_000_000) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(buffer);
}
