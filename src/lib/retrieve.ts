import type { Persona } from "./personas";
import type { Note } from "./types";

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Notes sorted by similarity to the query vector, most similar first. */
export function rankBySimilarity(notes: Note[], vectors: Map<string, number[]>, query: number[]): Note[] {
  return notes
    .filter((n) => vectors.has(n.id))
    .map((n) => ({ n, s: cosine(vectors.get(n.id) as number[], query) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.n);
}

export interface RetrievalInput {
  notes: Note[];                       // included, redacted notes
  persona: Persona;
  vectors?: Map<string, number[]>;     // note id → embedding
  queryVector?: number[];              // embedding of persona.retrievalQuery
}

/** Lens notes + top 3 similar others; fallbacks when there are no embeddings or no lens notes. */
export function retrieveForPersona({ notes, persona, vectors, queryVector }: RetrievalInput): Note[] {
  const lens = notes.filter((n) => persona.lens.includes(n.block));
  const canRank = vectors !== undefined && queryVector !== undefined;
  if (lens.length === 0) {
    return canRank ? rankBySimilarity(notes, vectors, queryVector).slice(0, 6) : notes;
  }
  if (!canRank) return lens;
  const lensIds = new Set(lens.map((n) => n.id));
  const extra = rankBySimilarity(notes.filter((n) => !lensIds.has(n.id)), vectors, queryVector).slice(0, 3);
  return [...lens, ...extra];
}
