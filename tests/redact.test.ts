import { describe, expect, it } from "vitest";
import { analysisNotes, parseTerms, redact } from "../src/lib/redact";

describe("redact", () => {
  it("is case-insensitive", () => {
    expect(redact("Try MatchDay today, matchday rocks", ["MATCHDAY"])).toBe("Try [REDACTED] today, [REDACTED] rocks");
  });

  it("handles multi-word terms and prefers the longest match", () => {
    expect(redact("Kick Off Pro beats Kick Off", ["Kick Off", "kick off pro"])).toBe("[REDACTED] beats [REDACTED]");
  });

  it("escapes regex characters such as dots in URLs", () => {
    expect(redact("see matchday.sg or matchdayXsg", ["matchday.sg"])).toBe("see [REDACTED] or matchdayXsg");
  });

  it("parses comma-separated terms and ignores blanks", () => {
    expect(parseTerms(" A , ,b.com ")).toEqual(["A", "b.com"]);
  });

  it("only passes included notes to analysis", () => {
    const out = analysisNotes([
      { id: "N01", text: "Acme app", block: "channels", included: true },
      { id: "N02", text: "Acme web", block: "channels", included: false },
    ], ["acme"]);
    expect(out).toEqual([{ id: "N01", text: "[REDACTED] app", block: "channels", included: true }]);
  });
});
