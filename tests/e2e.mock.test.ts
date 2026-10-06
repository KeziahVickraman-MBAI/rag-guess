import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerIds, importAnswersCsv } from "../src/lib/answers";
import { parseMiroCsv } from "../src/lib/csv";
import { planRetrieval, runBlindGuess, runDetective, runQuestions, synthesize } from "../src/lib/engine";
import { exportTranscriptMd } from "../src/lib/exportMd";
import { exportQuestionsR } from "../src/lib/exportR";
import { ungroundedIds } from "../src/lib/grounding";
import { personaById, PERSONAS } from "../src/lib/personas";
import { blindGuessUserPrompt, blindQuestionsUserPrompt, blindSystemPrompt, stitchAiStudioPrompt } from "../src/lib/prompts";
import { analysisNotes } from "../src/lib/redact";
import { DEFAULT_SETTINGS, emptyPerson, newSession, parseSession } from "../src/lib/store";
import type { PersonState } from "../src/lib/types";

const csvCell = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const boardA = (): string => readFileSync(new URL("../public/samples/board_a_screening.csv", import.meta.url), "utf8");
const mockCtx = () => ({ settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: new AbortController().signal, mockDelayMs: 0 });

describe("tab 1 — questions first (mock mode)", () => {
  it("blind questions → questions.R → answers.csv → guesses from answers → synthesize", async () => {
    const ctx = mockCtx();
    let persons: PersonState[] = [];
    for (const p of PERSONAS) {
      let streamed = "";
      const res = await runQuestions(ctx, p, (t) => { streamed += t; });
      expect(streamed).toBe(res.rawText);
      expect(res.questions.length).toBeGreaterThanOrEqual(3);
      persons.push({ ...emptyPerson(p.id), qRawText: res.rawText, qStatus: "done", questions: res.questions.map((question) => ({ question, answer: "" })) });
    }
    expect(exportQuestionsR(persons, "board_a_screening.csv")).toContain("person_4 = c(");

    // The RAG answers in R; answers.csv comes back (one question left unanswered).
    const rows = persons.flatMap((p) => p.questions.map((q, i) =>
      [`person_${p.personId}`, q.question, p.personId === 4 && i === 0 ? "NA" : `Answer ${p.personId}.${i + 1}: sports bars in Singapore`]));
    const imported = importAnswersCsv(["person,question,answer", ...rows.map((r) => r.map(csvCell).join(","))].join("\n"), persons);
    expect(imported.matched).toBe(rows.length);
    persons = imported.persons;

    for (const p of PERSONAS) {
      const person = persons[p.id - 1];
      const res = await runBlindGuess(ctx, p, person.questions, () => {});
      expect(res.card?.guess).toMatch(/^A .+ for .+ that helps them .+/);
      expect(res.card?.evidence_chain.every((e) => e.note_ids.every((id) => id.startsWith("A")))).toBe(true);
      expect(ungroundedIds(res.card!, answerIds(person)).size).toBe(0);
      persons[p.id - 1] = { ...person, rawText: res.rawText, card: res.card, status: "done" };
    }
    expect(persons[3].card?.unknowns.some((u) => u.startsWith("No answer to:"))).toBe(true);

    const out = await synthesize(ctx, persons.map((p) => ({ personId: p.personId, card: p.card! })));
    expect(stitchAiStudioPrompt(out.sections)).toContain("Build a working prototype web app.");
  });

  it("never puts the canvas in the blind prompts", () => {
    const notes = parseMiroCsv(boardA()).notes;
    const qa = [{ question: "Who is the primary segment?", answer: "Sports bars" }];
    for (const p of PERSONAS) {
      const prompts = [blindSystemPrompt(p), blindQuestionsUserPrompt(p), blindGuessUserPrompt(qa)].join("\n");
      expect(prompts).toMatch(/CANNOT see|asked the knowledge base|know nothing/);
      for (const n of notes) expect(prompts).not.toContain(n.text);
      expect(prompts).not.toMatch(/\bN\d{2}\b/);
    }
  });
});

describe("tab 2 — the entire simulation (mock mode)", () => {
  it("upload → detectives read notes → cards + questions → synthesize → export", async () => {
    const { notes } = parseMiroCsv(boardA());
    const ctx = mockCtx();
    const visible = analysisNotes(notes, ["Gemini"]);
    expect(visible.some((n) => n.text.includes("[REDACTED] API usage"))).toBe(true);

    const plan = await planRetrieval(ctx, visible);
    expect(plan.byPerson[3].every((n) => ["revenue_streams", "cost_structure"].includes(n.block))).toBe(true);

    const persons: PersonState[] = [];
    for (const p of PERSONAS) {
      let streamed = "";
      const res = await runDetective(ctx, p, plan.byPerson[p.id], (t) => { streamed += t; });
      expect(streamed).toBe(res.rawText);
      expect(res.card?.guess).toMatch(/^A .+ for .+ that helps them .+/);
      expect(res.questions?.length).toBeGreaterThanOrEqual(3);
      const retrievedNoteIds = plan.byPerson[p.id].map((n) => n.id);
      expect(ungroundedIds(res.card!, retrievedNoteIds).size).toBe(0);
      persons.push({
        ...emptyPerson(p.id), retrievedNoteIds, rawText: res.rawText, card: res.card, status: "done",
        questions: (res.questions ?? []).map((question) => ({ question, answer: "" })),
      });
    }
    expect(exportQuestionsR(persons, "board_a_screening.csv")).toContain("person_2 = c(");

    // A user edit flows into synthesis.
    persons[0].card = { ...persons[0].card!, confidence: 99, guess: "A screening planner for sports bars that helps them fill seats" };
    const out = await synthesize(ctx, persons.map((p) => ({ personId: p.personId, card: p.card! })));
    expect(out.consensus_guess).toBe("A screening planner for sports bars that helps them fill seats");
    const prompt = stitchAiStudioPrompt(out.sections);
    expect(prompt).toContain("not an official spec");

    const consensus = { consensus_guess: out.consensus_guess, agreements: out.agreements, disagreements: out.disagreements, aiStudioPrompt: prompt };
    const session = { ...newSession(ctx.settings), fileName: "board_a_screening.csv", notes, revealed: true, sim: { persons, consensus } };
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session);

    const md = exportTranscriptMd({
      fileName: session.fileName, notes, redactTerms: [],
      runs: [
        { title: "Questions first", persons: session.persons, consensus: null },
        { title: "Entire simulation", persons, consensus },
      ],
    });
    expect(md).toContain("## Entire simulation");
    expect(md).not.toContain("## Questions first"); // empty tab is left out
    expect(md).toContain(`### Person 2 — ${personaById(2).name}`);
    expect(md).toContain("#### Google AI Studio prompt");
  });
});

describe("session", () => {
  it("new boards start hidden; old sessions without a sim tab still load", () => {
    expect(newSession().revealed).toBe(false);
    const s = parseSession({ persons: [{ personId: 1, card: { guess: "g", rag_followup_questions: ["Q1?", "Q2?"] } }] });
    expect(s.persons[0].questions).toEqual([{ question: "Q1?", answer: "" }, { question: "Q2?", answer: "" }]);
    expect(s.sim.persons).toHaveLength(4);
    expect(s.sim.consensus).toBeNull();
    expect(s.revealed).toBe(false);
  });

  it("cancelling stops a mock run", async () => {
    const ctrl = new AbortController();
    const ctx = { settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: ctrl.signal, mockDelayMs: 1 };
    await expect(runQuestions(ctx, personaById(1), () => ctrl.abort())).rejects.toThrow();
  });
});
