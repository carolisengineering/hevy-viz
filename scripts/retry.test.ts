import { describe, expect, it } from "vitest";
import { MAX_RETRIES, MAX_RETRY_DELAY_MS, planRetry, retryDelayMs } from "./retry.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const backoff = (attempt: number) => 1000 * 2 ** attempt;

describe("retryDelayMs", () => {
  it("uses Retry-After seconds", () => {
    expect(retryDelayMs(1, "7", NOW)).toBe(7000);
    expect(retryDelayMs(1, " 7 ", NOW)).toBe(7000);
  });

  it("uses a Retry-After HTTP-date", () => {
    expect(retryDelayMs(1, "Sat, 14 Nov 2026 12:00:30 GMT", NOW)).toBe(30_000);
  });

  it("treats a past HTTP-date as retry now", () => {
    expect(retryDelayMs(1, "Sat, 14 Nov 2026 11:00:00 GMT", NOW)).toBe(0);
  });

  it("falls back to exponential backoff without a usable header", () => {
    for (const header of [null, "", "   ", "\t", "-3", "soon"]) {
      expect(retryDelayMs(3, header, NOW), JSON.stringify(header)).toBe(backoff(3));
    }
  });

  it("returns the server's full wait even past the cap, so the caller can decide", () => {
    expect(retryDelayMs(1, "3600", NOW)).toBe(3_600_000);
    expect(retryDelayMs(1, "3600", NOW)).toBeGreaterThan(MAX_RETRY_DELAY_MS);
  });

  it("keeps the backoff for every allowed attempt under the cap", () => {
    expect(backoff(MAX_RETRIES)).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
  });
});

describe("planRetry", () => {
  it("waits the server's requested time when it is within the cap", () => {
    expect(planRetry(1, "30", NOW)).toEqual({ retry: true, waitMs: 30_000 });
  });

  it("waits exactly the cap", () => {
    expect(planRetry(1, String(MAX_RETRY_DELAY_MS / 1000), NOW)).toEqual({ retry: true, waitMs: MAX_RETRY_DELAY_MS });
  });

  it("gives up, saying how long to wait, when the server asks for more than the cap", () => {
    const plan = planRetry(1, "3600", NOW);
    expect(plan.retry).toBe(false);
    if (!plan.retry) expect(plan.reason).toMatch(/3600 s/);
  });

  it("gives up after MAX_RETRIES attempts", () => {
    expect(planRetry(MAX_RETRIES, "1", NOW).retry).toBe(true);
    expect(planRetry(MAX_RETRIES + 1, "1", NOW).retry).toBe(false);
  });
});
