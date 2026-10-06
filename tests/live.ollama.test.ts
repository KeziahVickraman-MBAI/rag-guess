// Opt-in: OLLAMA_LIVE=1 npx vitest run tests/live.ollama.test.ts
// Runs the real model against the sample boards and writes the results to LIVE_OUT (if set).
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMiroCsv } from "../src/lib/csv";
import { planRetrieval, runBlindGuess, runDetective, runQuestions, synthesize } from "../src/lib/engine";
import { ungroundedIds } from "../src/lib/grounding";
import { PERSONAS } from "../src/lib/personas";
import { stitchAiStudioPrompt } from "../src/lib/prompts";
import { analysisNotes } from "../src/lib/redact";
import { DEFAULT_SETTINGS } from "../src/lib/store";
import type { DetectiveCard, PersonId } from "../src/lib/types";

describe.runIf(process.env.OLLAMA_LIVE)("live Ollama", () => {
  for (const board of ["board_a_screening.csv", "board_b_farm.csv"]) {
    it(`produces four cards and a prompt for ${board}`, { timeout: 900_000 }, async () => {
      const csv = readFileSync(new URL(`../public/samples/${board}`, import.meta.url), "utf8");
      const notes = analysisNotes(parseMiroCsv(csv).notes, []);
      const ctx = { settings: DEFAULT_SETTINGS, signal: new AbortController().signal };
      const plan = await planRetrieval(ctx, notes);
      const cards: { personId: PersonId; card: DetectiveCard }[] = [];
      const log: string[] = [`# ${board}`, plan.notice ?? `embeddings: ${plan.usedEmbeddings}`];
      for (const p of PERSONAS) {
        const t0 = Date.now();
        // Tab 1: blind questions, then a guess from the answers only.
        const q = await runQuestions(ctx, p, () => {});
        expect(q.questions.length).toBeGreaterThanOrEqual(1);
        // Stand-in for the R RAG: answer each question with two of this person's notes.
        const qa = q.questions.map((question, i) => ({ question, answer: plan.byPerson[p.id].slice(i, i + 2).map((n) => n.text).join(". ") }));
        const blind = await runBlindGuess(ctx, p, qa, () => {});
        // Tab 2: the detective reads the notes directly.
        const res = await runDetective(ctx, p, plan.byPerson[p.id], () => {});
        const ids = plan.byPerson[p.id].map((n) => n.id);
        log.push(`\n## ${p.name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
          "### Tab 1 blind questions", ...q.questions, q.error ?? "",
          "### Tab 1 guess from answers", JSON.stringify(blind.card?.guess), `error: ${blind.error ?? "none"}`,
          `ungrounded (tab 1): ${blind.card ? [...ungroundedIds(blind.card, qa.map((_, i) => `A${i + 1}`))].join(",") : "-"}`,
          "### Tab 2 simulation", res.rawText, `questions: ${JSON.stringify(res.questions)}`, "---",
          JSON.stringify(res.card, null, 1), `error: ${res.error ?? "none"}`,
          `ungrounded: ${res.card ? [...ungroundedIds(res.card, ids)].join(",") : "-"}`);
        expect(res.card).not.toBeNull();
        cards.push({ personId: p.id, card: res.card! });
      }
      const out = await synthesize({ ...ctx }, cards);
      log.push("\n## Synthesis", JSON.stringify(out, null, 1), stitchAiStudioPrompt(out.sections));
      if (process.env.LIVE_OUT) writeFileSync(`${process.env.LIVE_OUT}/${board}.md`, log.join("\n"));
      expect(out.consensus_guess.length).toBeGreaterThan(0);
    });
  }
});
