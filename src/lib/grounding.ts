import type { DetectiveCard } from "./types";

/** Cited note IDs that were not in this person's retrieved set. */
export function ungroundedIds(card: DetectiveCard, retrievedIds: string[]): Set<string> {
  const ok = new Set(retrievedIds);
  const bad = new Set<string>();
  for (const row of card.evidence_chain) for (const id of row.note_ids) if (!ok.has(id)) bad.add(id);
  return bad;
}

/** Note IDs like [N07] mentioned in free text. */
export const idsInText = (text: string): string[] => [...new Set(text.match(/N\d{2,3}/g) ?? [])];
