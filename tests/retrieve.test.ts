import { describe, expect, it } from "vitest";
import { personaById } from "../src/lib/personas";
import { cosine, rankBySimilarity, retrieveForPersona } from "../src/lib/retrieve";
import type { Note } from "../src/lib/types";

const n = (id: string, block: Note["block"]): Note => ({ id, text: id, block, included: true });
const notes = [n("N01", "revenue_streams"), n("N02", "channels"), n("N03", "key_partners"), n("N04", "unknown"), n("N05", "cost_structure")];
const vectors = new Map<string, number[]>([
  ["N01", [1, 0]], ["N02", [0.9, 0.1]], ["N03", [0, 1]], ["N04", [0.7, 0.7]], ["N05", [0.5, 0.5]],
]);

describe("cosine", () => {
  it("is 1 for parallel, 0 for orthogonal, 0 for zero vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("retrieval", () => {
  it("ranks by similarity, most similar first", () => {
    expect(rankBySimilarity(notes, vectors, [1, 0]).map((x) => x.id)).toEqual(["N01", "N02", "N04", "N05", "N03"]);
  });

  it("returns lens notes plus the top 3 similar others", () => {
    const got = retrieveForPersona({ notes, persona: personaById(3), vectors, queryVector: [0, 1] });
    expect(got.map((x) => x.id)).toEqual(["N01", "N05", "N03", "N04", "N02"]);
  });

  it("returns lens notes only without embeddings", () => {
    expect(retrieveForPersona({ notes, persona: personaById(3) }).map((x) => x.id)).toEqual(["N01", "N05"]);
  });

  it("falls back to top 6 by similarity when the lens is empty", () => {
    const got = retrieveForPersona({ notes, persona: personaById(2), vectors, queryVector: [1, 0] });
    expect(got.map((x) => x.id)).toEqual(["N01", "N02", "N04", "N05", "N03"]);
  });

  it("falls back to all notes when the lens is empty and there are no embeddings", () => {
    expect(retrieveForPersona({ notes, persona: personaById(2) })).toHaveLength(5);
  });
});
