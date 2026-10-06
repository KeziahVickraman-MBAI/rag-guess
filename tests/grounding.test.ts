import { describe, expect, it } from "vitest";
import { ungroundedIds } from "../src/lib/grounding";
import { coerceCard, emptyCard, normalizeNoteIds } from "../src/lib/schema";

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
  });
});

describe("model output coercion", () => {
  it("normalizes messy note ids", () => {
    expect(normalizeNoteIds(["[N7]", "n07", "N12, N3"])).toEqual(["N07", "N12", "N03"]);
  });

  it("clamps confidence, caps questions and rejects cards without a guess", () => {
    const c = coerceCard({ guess: " g ", confidence: 140, rag_followup_questions: ["1", "2", "3", "4", "5", "6"], evidence_chain: [{ note_ids: "N1" }] });
    expect(c?.confidence).toBe(100);
    expect(c?.rag_followup_questions).toHaveLength(5);
    expect(c?.evidence_chain[0]).toEqual({ note_ids: ["N01"], evidence: "", inference: "" });
    expect(coerceCard({ guess: "" })).toBeNull();
    expect(coerceCard("nope")).toBeNull();
  });
});
