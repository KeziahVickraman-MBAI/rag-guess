import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { BLOCKS } from "./blocks";
import { coerceCard } from "./schema";
import type { Consensus, Note, PersonId, PersonState, Settings } from "./types";

export const STORAGE_KEY = "bmc-detective-session-v1";

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://localhost:11434",
  chatModel: "llama3.2:3b",
  embedModel: "nomic-embed-text",
  detectiveTemperature: 0.7,
  synthTemperature: 0.3,
  timeoutSec: 120,
  mockMode: false,
};

/** One run of the four detectives plus their consensus. */
export interface Run {
  persons: PersonState[];
  consensus: Consensus | null;
}

export interface Session {
  version: 1;
  fileName: string;
  notes: Note[];
  revealed: boolean;      // notes table shown? hidden by default so players can't peek
  redactTerms: string;
  settings: Settings;
  persons: PersonState[]; // tab 1: questions first (blind detectives)
  consensus: Consensus | null;
  sim: Run;               // tab 2: the entire simulation (detectives read the notes)
}

export const emptyPerson = (personId: PersonId): PersonState => ({
  personId, retrievedNoteIds: [],
  questions: [], qRawText: "", qStatus: "idle",
  rawText: "", card: null, edited: false, status: "idle",
});

export const emptyPersons = (): PersonState[] => ([1, 2, 3, 4] as const).map(emptyPerson);

export const newSession = (settings: Settings = DEFAULT_SETTINGS): Session => ({
  version: 1,
  fileName: "",
  notes: [],
  revealed: false,
  redactTerms: "",
  settings,
  persons: emptyPersons(),
  consensus: null,
  sim: { persons: emptyPersons(), consensus: null },
});

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strOr = (v: unknown, d: string): string => (typeof v === "string" ? v : d);
const numOr = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function parsePersons(v: unknown): PersonState[] {
  const rawPersons = Array.isArray(v) ? v.filter(isObj) : [];
  return ([1, 2, 3, 4] as const).map((id): PersonState => {
    const p = rawPersons.find((x) => x.personId === id);
    if (!p) return emptyPerson(id);
    const card = p.card === null || p.card === undefined ? null : coerceCard(p.card);
    const status = p.status === "error" ? "error" : card ? "done" : "idle"; // never restore "running"
    // Older sessions kept the questions inside the card.
    const legacy = isObj(p.card) ? strings(p.card.rag_followup_questions) : [];
    const questions = Array.isArray(p.questions)
      ? p.questions.filter(isObj).map((q) => ({ question: strOr(q.question, ""), answer: strOr(q.answer, "") }))
      : legacy.map((question) => ({ question, answer: "" }));
    return {
      personId: id,
      retrievedNoteIds: strings(p.retrievedNoteIds),
      questions,
      qRawText: strOr(p.qRawText, ""),
      // Keep the saved status; "running" (or missing) is settled from whether there are questions.
      qStatus: p.qStatus === "error" || p.qStatus === "done" || p.qStatus === "idle" ? p.qStatus : questions.length ? "done" : "idle",
      qError: typeof p.qError === "string" ? p.qError : undefined,
      rawText: strOr(p.rawText, ""),
      card,
      edited: p.edited === true,
      status,
      error: typeof p.error === "string" ? p.error : undefined,
    };
  });
}

function parseConsensus(c: unknown): Consensus | null {
  return isObj(c)
    ? {
        consensus_guess: strOr(c.consensus_guess, ""),
        agreements: strings(c.agreements),
        disagreements: strings(c.disagreements),
        aiStudioPrompt: strOr(c.aiStudioPrompt, ""),
      }
    : null;
}

/** Validate an unknown blob (localStorage or imported session.json). Throws on garbage. */
export function parseSession(raw: unknown): Session {
  if (!isObj(raw)) throw new Error("Not a BMC Detective session file.");
  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    baseUrl: strOr(s.baseUrl, DEFAULT_SETTINGS.baseUrl),
    chatModel: strOr(s.chatModel, DEFAULT_SETTINGS.chatModel),
    embedModel: strOr(s.embedModel, DEFAULT_SETTINGS.embedModel),
    detectiveTemperature: numOr(s.detectiveTemperature, DEFAULT_SETTINGS.detectiveTemperature),
    synthTemperature: numOr(s.synthTemperature, DEFAULT_SETTINGS.synthTemperature),
    timeoutSec: numOr(s.timeoutSec, DEFAULT_SETTINGS.timeoutSec),
    mockMode: typeof s.mockMode === "boolean" ? s.mockMode : DEFAULT_SETTINGS.mockMode,
  };
  const notes: Note[] = (Array.isArray(raw.notes) ? raw.notes : []).filter(isObj).map((n) => ({
    id: strOr(n.id, ""),
    text: strOr(n.text, ""),
    block: BLOCKS.includes(n.block as Note["block"]) ? (n.block as Note["block"]) : "unknown",
    included: n.included !== false,
  })).filter((n) => n.id);
  const sim = isObj(raw.sim) ? raw.sim : {};
  return {
    version: 1,
    fileName: strOr(raw.fileName, ""),
    notes,
    revealed: raw.revealed === true,
    redactTerms: strOr(raw.redactTerms, ""),
    settings,
    persons: parsePersons(raw.persons),
    consensus: parseConsensus(raw.consensus),
    sim: { persons: parsePersons(sim.persons), consensus: parseConsensus(sim.consensus) },
  };
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseSession(JSON.parse(raw));
  } catch {
    /* corrupted or unavailable storage — start fresh */
  }
  return newSession();
}

/** Session state with debounced autosave to localStorage. */
export function useSession(): [Session, Dispatch<SetStateAction<Session>>] {
  const [session, setSession] = useState<Session>(loadSession);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        /* storage full or blocked — autosave is best-effort */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [session]);
  return [session, setSession];
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
