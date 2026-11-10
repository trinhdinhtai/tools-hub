import { describe, expect, it } from "vitest";
import { attempt, attemptError } from "./attempt";

class ParseError extends Error {
  constructor(readonly reason: "empty" | "invalid") {
    super(reason);
  }
}

class RangeLimitError extends Error {
  constructor(readonly reason: "too-large") {
    super(reason);
  }
}

describe("attempt", () => {
  it("returns the value when the work succeeds", () => {
    expect(attempt(() => 42, ParseError)).toEqual({ value: 42, error: null });
  });

  it("returns the reason of an expected error instead of throwing it", () => {
    expect(attempt(() => { throw new ParseError("invalid"); }, ParseError)).toEqual({ value: null, error: "invalid" });
  });

  it("accepts several expected error classes", () => {
    const run = () => { throw new RangeLimitError("too-large"); };
    expect(attempt(run, ParseError, RangeLimitError)).toEqual({ value: null, error: "too-large" });
  });

  it("rethrows any other error, since that is a bug and not bad Input", () => {
    const bug = new TypeError("boom");
    expect(() => attempt(() => { throw bug; }, ParseError)).toThrow(bug);
  });
});

describe("attemptError", () => {
  it("returns the value when the work succeeds", () => {
    expect(attemptError(() => "ok", ParseError)).toEqual({ value: "ok", error: null });
  });

  it("returns the expected error itself, for a UI that reads more than its reason", () => {
    const expected = new ParseError("empty");
    const result = attemptError(() => { throw expected; }, ParseError);
    expect(result.value).toBeNull();
    expect(result.error).toBe(expected);
  });

  it("rethrows any other error", () => {
    const bug = new RangeLimitError("too-large");
    expect(() => attemptError(() => { throw bug; }, ParseError)).toThrow(bug);
  });
});
