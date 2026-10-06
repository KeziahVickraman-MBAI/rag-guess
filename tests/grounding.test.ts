import { describe, expect, it } from "vitest";
import { ungroundedIds } from "../src/lib/grounding";
import { coerceCard, coerceQuestions, coerceSynthesis, emptyCard, normalizeNoteIds } from "../src/lib/schema";

describe("grounding", () => {
  it("flags cited ids that were not retrieved", () => {
    const card = {
      ...emptyCard(),
      guess: "x",
      evidence_chain: [
        { note_ids: ["N01", "N09"], evidence: "", inference: "" },
        { note_ids: ["N02"], evidence: "", inference: "" },
      ],
    };
    expect([...ungroundedIds(card, ["N01", "N02"])]).toEqual(["N09"]);
    // Answer IDs are valid citations once the person has answers.
    const withAnswer = { ...card, evidence_chain: [{ note_ids: ["A1", "A3"], evidence: "", inference: "" }] };
    expect([...ungroundedIds(withAnswer, ["N01", "A1", "A2"])]).toEqual(["A3"]);
  });
});

describe("model output coercion", () => {
  it("normalizes messy note ids", () => {
    expect(normalizeNoteIds(["[N7]", "n07", "N12, N3"])).toEqual(["N07", "N12", "N03"]);
    expect(normalizeNoteIds("[A1], a02, N4")).toEqual(["A1", "A2", "N04"]);
  });

  it("clamps confidence, caps questions and rejects cards without a guess", () => {
    const c = coerceCard({ guess: " g ", confidence: 140, evidence_chain: [{ note_ids: "N1" }] });
    expect(c?.confidence).toBe(100);
    expect(coerceQuestions({ questions: ["1", "", "2", "3", "4", "5", "6"] })).toEqual(["1", "2", "3", "4", "5"]);
    expect(coerceQuestions({ questions: "one" })).toEqual(["one"]);
    expect(coerceQuestions(null)).toEqual([]);
    expect(c?.evidence_chain[0]).toEqual({ note_ids: ["N01"], evidence: "", inference: "" });
    expect(coerceCard({ guess: "" })).toBeNull();
    expect(coerceCard("nope")).toBeNull();
  });
});

describe("unfilled templates", () => {
  it("rejects a guess or consensus that is still the blank template", () => {
    expect(coerceCard({ guess: "A ___ for ___ that helps them ___" })).toBeNull();
    expect(coerceCard({ guess: "A planner for bars that helps them fill seats" })?.guess).toBe("A planner for bars that helps them fill seats");
    expect(coerceSynthesis({ consensus_guess: "A ___ for ___", sections: {} })).toBeNull();
  });
});
