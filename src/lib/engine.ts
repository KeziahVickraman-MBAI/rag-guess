// Orchestrates retrieval, detective generation and synthesis — against Ollama or the mock.
import { mockDetective, mockQuestions, mockStream, mockSynthesis } from "./mock";
import { chatJSON, chatStream, embed, hasModel, OllamaError, tags, type CallOpts } from "./ollama";
import { personaById, PERSONAS, type Persona } from "./personas";
import {
  detectiveSystemPrompt, detectiveUserPrompt, QUESTIONS_STRUCTURE_PROMPT, questionsUserPrompt,
  STRICT_PROMPT, STRUCTURE_PROMPT, SYNTH_SYSTEM_PROMPT, synthUserPrompt,
} from "./prompts";
import { retrieveForPersona } from "./retrieve";
import { coerceCard, coerceQuestions, coerceSynthesis, detectiveCardSchema, questionsSchema, synthesisSchema } from "./schema";
import type { ChatMessage, DetectiveCard, Note, PersonId, QA, Settings, SynthesisOutput } from "./types";

export interface EngineCtx {
  settings: Settings;
  signal: AbortSignal;
  mockDelayMs?: number;
}

const callOpts = (ctx: EngineCtx): CallOpts => ({
  baseUrl: ctx.settings.baseUrl,
  timeoutMs: ctx.settings.timeoutSec * 1000,
  signal: ctx.signal,
});

// ---- Retrieval ----

const vectorCache = new Map<string, number[]>(); // `${model}\u0000${text}` → vector

export interface RetrievalPlan {
  byPerson: Record<PersonId, Note[]>;
  usedEmbeddings: boolean;
  notice?: string;
}

/** Work out which notes each persona sees. Uses embeddings if the embed model is installed. */
export async function planRetrieval(ctx: EngineCtx, notes: Note[]): Promise<RetrievalPlan> {
  let vectors: Map<string, number[]> | undefined;
  let queries: Map<PersonId, number[]> | undefined;
  let notice: string | undefined;

  if (!ctx.settings.mockMode && notes.length > 0) {
    const model = ctx.settings.embedModel.trim();
    try {
      const installed = model ? await tags(callOpts(ctx)) : [];
      if (model && hasModel(installed, model)) {
        const texts = [...notes.map((n) => n.text), ...PERSONAS.map((p) => p.retrievalQuery)];
        const key = (t: string): string => `${model}\u0000${t}`;
        const missing = [...new Set(texts.filter((t) => !vectorCache.has(key(t))))];
        if (missing.length) {
          const vecs = await embed({ ...callOpts(ctx), model, input: missing });
          missing.forEach((t, i) => vectorCache.set(key(t), vecs[i]));
        }
        vectors = new Map(notes.map((n) => [n.id, vectorCache.get(key(n.text)) as number[]]));
        queries = new Map(PERSONAS.map((p) => [p.id, vectorCache.get(key(p.retrievalQuery)) as number[]]));
      } else if (model) {
        notice = `Embedding model "${model}" not installed — using lens blocks only. (ollama pull ${model})`;
      }
    } catch (e) {
      if (e instanceof OllamaError && e.kind === "aborted") throw e;
      notice = `Embeddings unavailable (${e instanceof Error ? e.message : String(e)}) — using lens blocks only.`;
    }
  }

  const byPerson = {} as Record<PersonId, Note[]>;
  for (const p of PERSONAS) {
    byPerson[p.id] = retrieveForPersona({ notes, persona: p, vectors, queryVector: queries?.get(p.id) });
  }
  return { byPerson, usedEmbeddings: vectors !== undefined, notice };
}

// ---- Detectives ----

/** Stream the persona's reasoning, then a structured JSON pass; retry once with the strict prompt. */
async function streamThenJSON<T>(
  ctx: EngineCtx,
  persona: Persona,
  userPrompt: string,
  structurePrompt: string,
  format: object,
  coerce: (v: unknown) => T | null,
  onToken: (t: string) => void,
): Promise<{ rawText: string; value: T | null; error?: string }> {
  const s = ctx.settings;
  const base: ChatMessage[] = [
    { role: "system", content: detectiveSystemPrompt(persona) },
    { role: "user", content: userPrompt },
  ];
  const rawText = await chatStream(
    { ...callOpts(ctx), model: s.chatModel, messages: base, temperature: s.detectiveTemperature },
    onToken,
  );
  const attempts: ChatMessage[][] = [
    [...base, { role: "assistant", content: rawText }, { role: "user", content: structurePrompt }],
    [...base, { role: "user", content: STRICT_PROMPT }],
  ];
  let lastError = "";
  for (const messages of attempts) {
    try {
      const value = coerce(await chatJSON({ ...callOpts(ctx), model: s.chatModel, messages, temperature: s.detectiveTemperature, format }));
      if (value) return { rawText, value };
      lastError = "The model's JSON was missing required fields.";
    } catch (e) {
      if (e instanceof OllamaError && e.kind !== "invalid_json") throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { rawText, value: null, error: lastError };
}

export interface QuestionsResult {
  rawText: string;
  questions: string[];
  error?: string;
}

/** Phase 1: questions for the RAG, no guess. */
export async function runQuestions(
  ctx: EngineCtx,
  persona: Persona,
  notes: Note[],
  onToken: (t: string) => void,
): Promise<QuestionsResult> {
  if (ctx.settings.mockMode) {
    const { rawText, questions } = mockQuestions(persona, notes);
    await mockStream(rawText, onToken, ctx.signal, ctx.mockDelayMs);
    return { rawText, questions };
  }
  const r = await streamThenJSON(ctx, persona, questionsUserPrompt(notes), QUESTIONS_STRUCTURE_PROMPT, questionsSchema,
    (v) => { const q = coerceQuestions(v); return q.length ? q : null; }, onToken);
  return r.value
    ? { rawText: r.rawText, questions: r.value }
    : { rawText: r.rawText, questions: [], error: `Invalid JSON after retry — type the questions by hand. (${r.error})` };
}

export interface DetectiveResult {
  rawText: string;
  card: DetectiveCard | null;
  error?: string;
}

/** Phase 2: the guess card, from the notes plus the RAG's answers. */
export async function runDetective(
  ctx: EngineCtx,
  persona: Persona,
  notes: Note[],
  qa: QA[],
  onToken: (t: string) => void,
): Promise<DetectiveResult> {
  if (ctx.settings.mockMode) {
    const { rawText, card } = mockDetective(persona, notes, qa);
    await mockStream(rawText, onToken, ctx.signal, ctx.mockDelayMs);
    return { rawText, card };
  }
  const r = await streamThenJSON(ctx, persona, detectiveUserPrompt(notes, qa), STRUCTURE_PROMPT, detectiveCardSchema, coerceCard, onToken);
  return r.value
    ? { rawText: r.rawText, card: r.value }
    : { rawText: r.rawText, card: null, error: `Invalid JSON after retry — fill the card by hand from the reasoning. (${r.error})` };
}

// ---- Synthesis ----

export async function synthesize(
  ctx: EngineCtx,
  cards: { personId: PersonId; card: DetectiveCard }[],
): Promise<SynthesisOutput> {
  if (ctx.settings.mockMode) return mockSynthesis(cards);
  const s = ctx.settings;
  const named = cards.map((c) => ({ ...c, name: personaById(c.personId).name }));
  const base: ChatMessage[] = [
    { role: "system", content: SYNTH_SYSTEM_PROMPT },
    { role: "user", content: synthUserPrompt(named) },
  ];
  for (const messages of [base, [...base, { role: "user" as const, content: STRICT_PROMPT }]]) {
    try {
      const out = coerceSynthesis(
        await chatJSON({ ...callOpts(ctx), model: s.chatModel, messages, temperature: s.synthTemperature, format: synthesisSchema }),
      );
      if (out) return out;
    } catch (e) {
      if (e instanceof OllamaError && e.kind !== "invalid_json") throw e;
    }
  }
  throw new OllamaError("invalid_json", "The synthesizer did not return valid JSON after a retry. Try Regenerate.");
}
