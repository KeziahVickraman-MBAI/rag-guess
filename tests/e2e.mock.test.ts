import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMiroCsv } from "../src/lib/csv";
import { planRetrieval, runDetective, synthesize } from "../src/lib/engine";
import { exportTranscriptMd } from "../src/lib/exportMd";
import { exportQuestionsR } from "../src/lib/exportR";
import { ungroundedIds } from "../src/lib/grounding";
import { personaById, PERSONAS } from "../src/lib/personas";
import { stitchAiStudioPrompt } from "../src/lib/prompts";
import { analysisNotes } from "../src/lib/redact";
import { DEFAULT_SETTINGS, newSession, parseSession } from "../src/lib/store";
import type { PersonState } from "../src/lib/types";

describe("mock mode end to end", () => {
  it("upload sample → run all → synthesize → export", async () => {
    const csv = readFileSync(new URL("../public/samples/board_a_screening.csv", import.meta.url), "utf8");
    const { notes } = parseMiroCsv(csv);
    const ctx = { settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: new AbortController().signal, mockDelayMs: 0 };
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
      expect(res.card?.rag_followup_questions.length).toBeGreaterThanOrEqual(3);
      const retrievedNoteIds = plan.byPerson[p.id].map((n) => n.id);
      expect(ungroundedIds(res.card!, retrievedNoteIds).size).toBe(0);
      persons.push({ personId: p.id, retrievedNoteIds, rawText: res.rawText, card: res.card, edited: false, status: "done" });
    }

    // A user edit flows into synthesis.
    persons[0].card = { ...persons[0].card!, confidence: 99, guess: "A screening planner for sports bars that helps them fill seats" };
    const out = await synthesize(ctx, persons.map((p) => ({ personId: p.personId, card: p.card! })));
    expect(out.consensus_guess).toBe("A screening planner for sports bars that helps them fill seats");
    const prompt = stitchAiStudioPrompt(out.sections);
    expect(prompt).toContain("Build a working prototype web app.");
    expect(prompt).toContain("not an official spec");

    const r = exportQuestionsR(persons, "board_a_screening.csv");
    expect(r).toContain("person_4 = c(");
    expect(r).toContain("all_questions <- unlist(rag_questions, use.names = FALSE)");

    const session = { ...newSession(ctx.settings), fileName: "board_a_screening.csv", notes, persons,
      consensus: { consensus_guess: out.consensus_guess, agreements: out.agreements, disagreements: out.disagreements, aiStudioPrompt: prompt } };
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session);

    const md = exportTranscriptMd({ fileName: session.fileName, notes, redactTerms: [], persons, consensus: session.consensus });
    expect(md).toContain(`## Person 2 — ${personaById(2).name}`);
    expect(md).toContain("## Google AI Studio prompt");
  });

  it("cancelling stops a mock run", async () => {
    const ctrl = new AbortController();
    const ctx = { settings: { ...DEFAULT_SETTINGS, mockMode: true }, signal: ctrl.signal, mockDelayMs: 1 };
    const notes = parseMiroCsv("Content,Tags\nBars,customer_segments\n").notes;
    const run = runDetective(ctx, personaById(1), notes, () => ctrl.abort());
    await expect(run).rejects.toThrow();
  });
});
