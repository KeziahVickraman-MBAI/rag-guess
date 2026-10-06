import { BLOCK_LABELS } from "./blocks";
import { personaById } from "./personas";
import type { Consensus, Note, PersonState } from "./types";

const list = (items: string[]): string => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)");

export function exportTranscriptMd(args: {
  fileName: string;
  notes: Note[];
  redactTerms: string[];
  persons: PersonState[];
  consensus: Consensus | null;
  now?: Date;
}): string {
  const { fileName, notes, redactTerms, persons, consensus } = args;
  const out: string[] = [];
  out.push(`# BMC Detective — ${fileName || "session"}`, "", `Generated ${(args.now ?? new Date()).toISOString()}`, "");
  out.push("## Notes", "", "| ID | Block | Included | Text |", "|---|---|---|---|");
  for (const n of notes) out.push(`| ${n.id} | ${BLOCK_LABELS[n.block]} | ${n.included ? "yes" : "no"} | ${n.text.replace(/\|/g, "\\|")} |`);
  out.push("", `Redacted terms: ${redactTerms.length ? redactTerms.join(", ") : "(none)"}`, "");

  for (const p of persons) {
    const persona = personaById(p.personId);
    out.push(`## Person ${p.personId} — ${persona.name}`, "");
    out.push(`Notes seen: ${p.retrievedNoteIds.join(", ") || "(not run)"}`, "");
    if (p.rawText) out.push("### Thinking out loud", "", "```", p.rawText.trim(), "```", "");
    const c = p.card;
    if (!c) { out.push("_No card._", ""); continue; }
    out.push(
      `**Guess:** ${c.guess}`, "",
      `- Target user: ${c.target_user}`,
      `- Problem solved: ${c.problem_solved}`,
      `- Domain and location: ${c.domain_and_location}`,
      `- Confidence: ${c.confidence}/100`, "",
      "### Evidence chain", "",
      list(c.evidence_chain.map((e) => `[${e.note_ids.join(", ")}] ${e.evidence} → ${e.inference}`)), "",
      "### Unknowns", "", list(c.unknowns), "",
      "### Follow-up questions for the RAG", "", list(c.rag_followup_questions), "",
    );
  }
  if (consensus) {
    out.push(
      "## Consensus", "", `**${consensus.consensus_guess}**`, "",
      "### Agreements", "", list(consensus.agreements), "",
      "### Disagreements", "", list(consensus.disagreements), "",
      "## Google AI Studio prompt", "", "```", consensus.aiStudioPrompt, "```", "",
    );
  }
  return out.join("\n");
}
