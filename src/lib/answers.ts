// answers.csv (written in R after asking the RAG) → answers on each person's questions.
import Papa from "papaparse";
import { PERSONAS } from "./personas";
import type { PersonId, PersonState } from "./types";

export interface AnswersImport {
  persons: PersonState[];
  matched: number;   // answers attached to an existing question
  added: number;     // rows for a known person whose question wasn't in the list (appended)
  unmatched: number; // rows we couldn't place (no person, unknown question)
}

const PERSON_HEADERS = ["person", "persona", "detective", "group", "who", "id"];
const QUESTION_HEADERS = ["question", "questions", "q", "query", "prompt"];
const ANSWER_HEADERS = ["answer", "answers", "a", "response", "reply", "result", "output"];

const key = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** "person_2", "2", "Person 2", "Value Hunter" → 2 */
export function parsePersonId(raw: string): PersonId | null {
  const m = raw.match(/[1-4]/);
  if (m) return Number(m[0]) as PersonId;
  const k = key(raw);
  return k ? (PERSONAS.find((p) => key(p.name) === k)?.id ?? null) : null;
}

/** R writes missing values as NA. */
const cleanAnswer = (s: string): string => (/^\s*(NA|NULL)\s*$/.test(s) ? "" : s.trim());

export function importAnswersCsv(input: string, persons: PersonState[]): AnswersImport {
  const rows = Papa.parse<string[]>(input.replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data
    .map((r) => r.map((c) => (c ?? "").toString()));
  if (rows.length === 0) throw new Error("answers.csv is empty.");

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const find = (names: string[]): number => header.findIndex((h) => names.includes(h));
  let pCol = find(PERSON_HEADERS), qCol = find(QUESTION_HEADERS), aCol = find(ANSWER_HEADERS);
  const hasHeader = qCol >= 0 && aCol >= 0;
  if (!hasHeader) {
    // No recognisable header: person,question,answer or question,answer.
    const width = Math.max(...rows.map((r) => r.length));
    [pCol, qCol, aCol] = width >= 3 ? [0, 1, 2] : [-1, 0, 1];
  }
  if (aCol < 0) throw new Error('answers.csv needs "question" and "answer" columns (and ideally "person").');

  const next = persons.map((p) => ({ ...p, questions: p.questions.map((q) => ({ ...q })) }));
  let matched = 0, added = 0, unmatched = 0;
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const question = (r[qCol] ?? "").trim();
    const answer = cleanAnswer(r[aCol] ?? "");
    if (!question) continue;
    const pid = pCol >= 0 ? parsePersonId(r[pCol] ?? "") : null;
    const pool = pid ? next.filter((p) => p.personId === pid) : next;
    const hit = pool.flatMap((p) => p.questions).find((q) => key(q.question) === key(question));
    if (hit) {
      hit.answer = answer;
      matched++;
    } else if (pid) {
      next[pid - 1].questions.push({ question, answer });
      added++;
    } else {
      unmatched++;
    }
  }
  if (matched + added === 0) {
    throw new Error("None of the rows in answers.csv matched the detectives' questions. Check the person and question columns.");
  }
  return { persons: next, matched, added, unmatched };
}

/** Answer IDs the detective may cite: A1… for each answered question, in order. */
export const answerIds = (p: PersonState): string[] =>
  p.questions.filter((q) => q.answer.trim()).map((_, i) => `A${i + 1}`);
