import type { Note } from "./types";

export const REDACTED = "[REDACTED]";

export function parseTerms(input: string): string[] {
  return input.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive replacement of every term. Longer terms go first so "Acme Pro" wins over "Acme". */
export function redact(text: string, terms: string[]): string {
  const sorted = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return text;
  const re = new RegExp(sorted.map(escapeRegExp).join("|"), "gi");
  return text.replace(re, REDACTED);
}

/** Included notes with redaction applied — this is what the detectives see. */
export function analysisNotes(notes: Note[], terms: string[]): Note[] {
  return notes.filter((n) => n.included).map((n) => ({ ...n, text: redact(n.text, terms) }));
}
