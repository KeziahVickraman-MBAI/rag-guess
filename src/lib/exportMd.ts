import { BLOCK_LABELS } from "./blocks";
import { personaById } from "./personas";
import type { Consensus, Note, PersonState } from "./types";

const list = (items: string[]): string => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)");

export interface TranscriptRun {
  title: string;
  persons: PersonState[];
  consensus: Consensus | null;
}

const hasContent = (r: TranscriptRun): boolean =>
  r.consensus !== null || r.persons.some((p) => p.card || p.questions.length || p.qRawText || p.rawText);

export function exportTranscriptMd(args: {
  fileName: string;
  notes: Note[];
  redactTerms: string[];
  runs: TranscriptRun[];
  now?: Date;
}): string {
  const { fileName, notes, redactTerms, runs } = args;
  const out: string[] = [];
  out.push(`# BMC Detective — ${fileName || "session"}`, "", `Generated ${(args.now ?? new Date()).toISOString()}`, "");
  out.push("## Notes", "", "| ID | Block | Included | Text |", "|---|---|---|---|");
  for (const n of notes) out.push(`| ${n.id} | ${BLOCK_LABELS[n.block]} | ${n.included ? "yes" : "no"} | ${n.text.replace(/\|/g, "\\|")} |`);
  out.push("", `Redacted terms: ${redactTerms.length ? redactTerms.join(", ") : "(none)"}`, "");

  for (const run of runs.filter(hasContent)) {
    out.push(`## ${run.title}`, "");
    for (const p of run.persons) {
      const persona = personaById(p.personId);
      out.push(`### Person ${p.personId} — ${persona.name}`, "");
      if (p.retrievedNoteIds.length) out.push(`Notes seen: ${p.retrievedNoteIds.join(", ")}`, "");
      if (p.qRawText) out.push("#### Thinking before asking", "", "```", p.qRawText.trim(), "```", "");
      out.push("#### Questions for the RAG and its answers", "");
      out.push(p.questions.length
        ? p.questions.map((q, i) => `${i + 1}. **${q.question}**\n   ${q.answer.trim() || "_(no answer)_"}`).join("\n")
        : "- (none)", "");
      if (p.rawText) out.push("#### Thinking out loud", "", "```", p.rawText.trim(), "```", "");
      const c = p.card;
      if (!c) { out.push("_No card._", ""); continue; }
      out.push(
        `**Guess:** ${c.guess}`, "",
        `- Target user: ${c.target_user}`,
        `- Problem solved: ${c.problem_solved}`,
        `- Domain and location: ${c.domain_and_location}`,
        `- Confidence: ${c.confidence}/100`, "",
        "#### Evidence chain", "",
        list(c.evidence_chain.map((e) => `[${e.note_ids.join(", ")}] ${e.evidence} → ${e.inference}`)), "",
        "#### Unknowns", "", list(c.unknowns), "",
      );
    }
    const consensus = run.consensus;
    if (consensus) {
      out.push(
        "### Consensus", "", `**${consensus.consensus_guess}**`, "",
        "#### Agreements", "", list(consensus.agreements), "",
        "#### Disagreements", "", list(consensus.disagreements), "",
        "#### Google AI Studio prompt", "", "```", consensus.aiStudioPrompt, "```", "",
      );
    }
  }
  return out.join("\n");
}
