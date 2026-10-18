// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchText, ProviderHttpError, retry } from "./http";

describe("provider request handling", () => {
  it("keeps rate limit status and Retry-After without leaking the URL", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("limit", {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
    );
    await expect(
      fetchText("https://example.com/?api_key=secret", fetcher),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 60_000,
      message: "HTTP 429",
    });
  });
  it("retries transient errors twice and stops on permanent errors", async () => {
    const transient = vi
      .fn()
      .mockRejectedValueOnce(new ProviderHttpError(503))
      .mockRejectedValueOnce(new ProviderHttpError(502))
      .mockResolvedValue("ok");
    expect(await retry(transient, 2, 0)).toBe("ok");
    expect(transient).toHaveBeenCalledTimes(3);
    const forbidden = vi.fn().mockRejectedValue(new ProviderHttpError(403));
    await expect(retry(forbidden, 2, 0)).rejects.toMatchObject({ status: 403 });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
  it("surfaces long rate limits instead of retrying earlier than requested", async () => {
    const limited = vi
      .fn()
      .mockRejectedValue(new ProviderHttpError(429, 120_000));
    await expect(retry(limited)).rejects.toMatchObject({ status: 429 });
    expect(limited).toHaveBeenCalledTimes(1);
  });
});
