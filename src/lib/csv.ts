import Papa from "papaparse";
import { guessBlock, matchBlockTag } from "./blocks";
import type { Note } from "./types";

export class EmptyCsvError extends Error {
  constructor() {
    super("The CSV has no usable notes. Check that you exported the board's sticky notes from Miro.");
    this.name = "EmptyCsvError";
  }
}

export interface ParseResult {
  notes: Note[];
  textColumn: string;
  tagColumn: string | null;
  hasHeader: boolean;
}

const TEXT_HEADERS = ["content", "text", "title", "note", "notes", "sticky", "body"];
const TAG_HEADERS = ["tags", "tag", "block", "section", "category", "frame", "area", "label"];

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const noteId = (i: number): string => `N${String(i + 1).padStart(2, "0")}`;

function looksLikeHeader(row: string[]): boolean {
  return row.some((c) => {
    const k = c.trim().toLowerCase();
    return TEXT_HEADERS.includes(k) || TAG_HEADERS.includes(k);
  });
}

/** Parse a Miro board CSV export into notes. Defensive about headers, columns and HTML. */
export function parseMiroCsv(input: string): ParseResult {
  const parsed = Papa.parse<string[]>(input.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const rows = parsed.data
    .map((r) => r.map((c) => (c ?? "").toString()))
    .filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) throw new EmptyCsvError();

  const hasHeader = looksLikeHeader(rows[0]);
  const header = hasHeader ? rows[0].map((h) => h.trim()) : [];
  const body = hasHeader ? rows.slice(1) : rows;
  const width = Math.max(...rows.map((r) => r.length));
  const colName = (i: number): string => header[i] || `Column ${i + 1}`;
  const nonEmpty = (i: number): number => body.filter((r) => (r[i] ?? "").trim() !== "").length;

  let textCol = -1;
  let tagCol = -1;
  if (hasHeader) {
    const lower = header.map((h) => h.toLowerCase());
    for (const name of TEXT_HEADERS) {
      const i = lower.indexOf(name);
      if (i >= 0 && nonEmpty(i) > 0) { textCol = i; break; }
    }
    for (const name of TAG_HEADERS) {
      const i = lower.indexOf(name);
      if (i >= 0 && i !== textCol) { tagCol = i; break; }
    }
  }
  if (tagCol < 0) {
    // A column where most values match a block name is a tag column.
    for (let i = 0; i < width; i++) {
      if (i === textCol) continue;
      const n = nonEmpty(i);
      const matches = body.filter((r) => matchBlockTag(r[i] ?? "") !== null).length;
      if (n > 0 && matches / n >= 0.6) { tagCol = i; break; }
    }
  }
  if (textCol < 0) {
    // Otherwise pick the column with the longest average text.
    let bestLen = -1;
    for (let i = 0; i < width; i++) {
      if (i === tagCol) continue;
      const n = nonEmpty(i);
      if (n === 0) continue;
      const avg = body.reduce((s, r) => s + stripHtml(r[i] ?? "").length, 0) / n;
      if (avg > bestLen) { bestLen = avg; textCol = i; }
    }
  }
  if (textCol < 0) throw new EmptyCsvError();

  const notes: Note[] = [];
  for (const r of body) {
    const text = stripHtml(r[textCol] ?? "");
    if (!text) continue;
    const tagged = tagCol >= 0 ? matchBlockTag(stripHtml(r[tagCol] ?? "")) : null;
    notes.push({ id: noteId(notes.length), text, block: tagged ?? guessBlock(text), included: true });
  }
  if (notes.length === 0) throw new EmptyCsvError();

  return { notes, textColumn: colName(textCol), tagColumn: tagCol >= 0 ? colName(tagCol) : null, hasHeader };
}

export function unknownShare(notes: Note[]): number {
  const inc = notes.filter((n) => n.included);
  return inc.length === 0 ? 0 : inc.filter((n) => n.block === "unknown").length / inc.length;
}
