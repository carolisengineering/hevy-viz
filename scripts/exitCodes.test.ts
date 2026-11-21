import { describe, expect, it } from "vitest";
import { EXIT, HevyHttpError, RateLimitError, SaveError, UnexpectedResponseError, exitCodeFor } from "./exitCodes.ts";

const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });

describe("exitCodeFor", () => {
  it("a rejected key is 20", () => {
    expect(exitCodeFor(new HevyHttpError(401, "x"))).toBe(EXIT.badKey);
    expect(exitCodeFor(new HevyHttpError(403, "x"))).toBe(EXIT.badKey);
  });
  it("other HTTP errors are 23", () => {
    for (const s of [400, 404, 500, 502, 503]) expect(exitCodeFor(new HevyHttpError(s, "x"))).toBe(EXIT.hevyError);
  });
  it("an unexpected response from Hevy is 23", () => expect(exitCodeFor(new UnexpectedResponseError("x"))).toBe(EXIT.hevyError));
  it("giving up on rate limits is 21", () => expect(exitCodeFor(new RateLimitError("x"))).toBe(EXIT.rateLimited));
  it("a failed save is 24", () => expect(exitCodeFor(new SaveError("x"))).toBe(EXIT.saveFailed));
  it("known network failures are 22", () => {
    for (const c of ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT"]) expect(exitCodeFor(netError(c))).toBe(EXIT.offline);
    const agg = Object.assign(new TypeError("fetch failed"), { cause: new AggregateError([Object.assign(new Error(), { code: "ECONNREFUSED" })]) });
    expect(exitCodeFor(agg)).toBe(EXIT.offline);
  });
  it("anything else is 1", () => {
    expect(exitCodeFor(new TypeError("Invalid header value"))).toBe(1);
    expect(exitCodeFor(netError("EWHATEVER"))).toBe(1);
    expect(exitCodeFor(new Error("boom"))).toBe(1);
    expect(exitCodeFor("a string")).toBe(1);
  });
  it("the codes stay clear of Node's own and are distinct", () => {
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c >= 20 && c < 126).toBe(true);
  });
});
