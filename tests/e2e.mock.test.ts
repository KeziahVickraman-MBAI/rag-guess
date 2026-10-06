import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importAnswersCsv } from "../src/lib/answers";
import { parseMiroCsv } from "../src/lib/csv";
import { planRetrieval, runDetective, runQuestions, synthesize } from "../src/lib/engine";
import { exportTranscriptMd } from "../src/lib/exportMd";
import { exportQuestionsR } from "../src/lib/exportR";
import { ungroundedIds } from "../src/lib/grounding";
import { answerIds } from "../src/lib/answers";
import { personaById, PERSONAS } from "../src/lib/personas";
import { stitchAiStudioPrompt } from "../src/lib/prompts";
import { analysisNotes } from "../src/lib/redact";
import { DEFAULT_SETTINGS, emptyPerson, newSession, parseSession } from "../src/lib/store";
import type { PersonState } from "../src/lib/types";

const csvCell = (s: string): string => `"${s.replace(/"/g, '""')}"`;

describe("mock mode end to end", () => {
  it("upload → questions → questions.R → answers.csv → detectives → synthesize → export", async () => {
    const csv = readFileSync(new URL("../public/samples/board_a_screening.csv", import.meta.url), "utf8");
    const { notes } = parseMiroCsv(csv);
    const ctx = { settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: new AbortController().signal, mockDelayMs: 0 };
    const visible = analysisNotes(notes, ["Gemini"]);
    expect(visible.some((n) => n.text.includes("[REDACTED] API usage"))).toBe(true);

    const plan = await planRetrieval(ctx, visible);
    expect(plan.byPerson[3].every((n) => ["revenue_streams", "cost_structure"].includes(n.block))).toBe(true);

    // Phase 1: questions only.
    let persons: PersonState[] = [];
    for (const p of PERSONAS) {
      let streamed = "";
      const res = await runQuestions(ctx, p, plan.byPerson[p.id], (t) => { streamed += t; });
      expect(streamed).toBe(res.rawText);
      expect(res.questions.length).toBeGreaterThanOrEqual(3);
      persons.push({
        ...emptyPerson(p.id), retrievedNoteIds: plan.byPerson[p.id].map((n) => n.id),
        qRawText: res.rawText, qStatus: "done", questions: res.questions.map((question) => ({ question, answer: "" })),
      });
    }
    const r = exportQuestionsR(persons, "board_a_screening.csv");
    expect(r).toContain("person_4 = c(");
    expect(r).toContain("all_questions <- unlist(rag_questions, use.names = FALSE)");

    // The RAG answers in R; answers.csv comes back (one question left unanswered).
    const rows = persons.flatMap((p) => p.questions.map((q, i) =>
      [`person_${p.personId}`, q.question, p.personId === 4 && i === 0 ? "NA" : `Answer ${p.personId}.${i + 1}: venues in Singapore`]));
    const answersCsv = ["person,question,answer", ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
    const imported = importAnswersCsv(answersCsv, persons);
    expect(imported.matched).toBe(rows.length);
    persons = imported.persons;
    expect(persons[3].questions[0].answer).toBe("");
    expect(persons[0].questions[0].answer).toBe("Answer 1.1: venues in Singapore");

    // Phase 2: guesses use the answers.
    for (const p of PERSONAS) {
      const person = persons[p.id - 1];
      const res = await runDetective(ctx, p, plan.byPerson[p.id], person.questions, () => {});
      expect(res.card?.guess).toMatch(/^A .+ for .+ that helps them .+/);
      expect(res.card?.evidence_chain.some((e) => e.note_ids.includes("A1"))).toBe(true);
      expect(ungroundedIds(res.card!, [...person.retrievedNoteIds, ...answerIds(person)]).size).toBe(0);
      persons[p.id - 1] = { ...person, rawText: res.rawText, card: res.card, status: "done" };
    }

    // A user edit flows into synthesis.
    persons[0].card = { ...persons[0].card!, confidence: 99, guess: "A screening planner for sports bars that helps them fill seats" };
    const out = await synthesize(ctx, persons.map((p) => ({ personId: p.personId, card: p.card! })));
    expect(out.consensus_guess).toBe("A screening planner for sports bars that helps them fill seats");
    const prompt = stitchAiStudioPrompt(out.sections);
    expect(prompt).toContain("Build a working prototype web app.");
    expect(prompt).toContain("not an official spec");

    const session = { ...newSession(ctx.settings), fileName: "board_a_screening.csv", notes, persons,
      consensus: { consensus_guess: out.consensus_guess, agreements: out.agreements, disagreements: out.disagreements, aiStudioPrompt: prompt } };
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session);

    const md = exportTranscriptMd({ fileName: session.fileName, notes, redactTerms: [], persons, consensus: session.consensus });
    expect(md).toContain(`## Person 2 — ${personaById(2).name}`);
    expect(md).toContain("Answer 2.1: venues in Singapore");
    expect(md).toContain("## Google AI Studio prompt");
  });

  it("restores questions from an older session that kept them in the card", () => {
    const s = parseSession({ persons: [{ personId: 1, card: { guess: "g", rag_followup_questions: ["Q1?", "Q2?"] } }] });
    expect(s.persons[0].questions).toEqual([{ question: "Q1?", answer: "" }, { question: "Q2?", answer: "" }]);
    expect(s.persons[0].qStatus).toBe("done");
  });

  it("cancelling stops a mock run", async () => {
    const ctrl = new AbortController();
    const ctx = { settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: ctrl.signal, mockDelayMs: 1 };
    const notes = parseMiroCsv("Content,Tags\nBars,customer_segments\n").notes;
    const run = runQuestions(ctx, personaById(1), notes, () => ctrl.abort());
    await expect(run).rejects.toThrow();
  });
});
