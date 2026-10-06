// ALL prompts live here. Tuned for a 3B model: short, concrete, small context.
import { BLOCK_LABELS } from "./blocks";
import type { Persona } from "./personas";
import type { AiStudioSections, DetectiveCard, Note, PersonId, QA } from "./types";

export const formatNotes = (notes: Note[]): string =>
  notes.map((n) => `${n.id} | ${n.block} | ${n.text}`).join("\n");

const lensBlocks = (p: Persona): string => p.lens.map((b) => BLOCK_LABELS[b]).join(", ");

export const STRICT_PROMPT =
  "Return only JSON matching the schema. Use only what you were given above. Keep each string under 30 words.";

// =====================================================================
// Tab 1 — Questions first. The detectives never see the canvas: they
// question a knowledge base built from it, then guess from the answers.
// =====================================================================

export function blindSystemPrompt(p: Persona): string {
  return `You are ${p.name}, one of four detectives working out what product or service a startup is building.
You CANNOT see the startup's Business Model Canvas. You can only ask questions to a knowledge base built from it.
Your lens: ${p.lensDescription} (${lensBlocks(p)}).
Rules:
- Assume nothing about the product. Use only the knowledge base's answers.
- Never invent a product name. Never mention a real brand unless an answer mentions it.`;
}

export function blindQuestionsUserPrompt(p: Persona): string {
  return `You know nothing about the product yet.
1. In 2-3 short lines, think out loud: what do you need to find out through your lens?
2. Write 3-5 questions to ask the knowledge base.
   - Each must be answerable from a Business Model Canvas, especially ${lensBlocks(p)}.
   - Start broad, then get more specific.
   - Each should help reveal what the product is, who it is for, or how it works.
   Bad: "What is the app called?"  Good: "Which customer segment is listed as primary, and where are they located?"`;
}

export const QUESTIONS_STRUCTURE_PROMPT =
  "Now return your 3-5 questions as JSON. Each question under 30 words. Return only JSON.";

/** Long RAG answers are trimmed so the 3B model's context stays small. */
const clip = (s: string, words = 80): string => {
  const w = s.trim().split(/\s+/);
  return w.length > words ? `${w.slice(0, words).join(" ")}…` : s.trim();
};

/** Answered questions only, numbered A1, A2, … in the order given. */
export function formatAnswers(qa: QA[]): string {
  const answered = qa.filter((x) => x.answer.trim());
  return answered.length
    ? answered.map((x, i) => `A${i + 1}. Q: ${x.question}\n    A: ${clip(x.answer)}`).join("\n")
    : "(No answers yet.)";
}

export function blindGuessUserPrompt(qa: QA[]): string {
  return `You asked the knowledge base. Its answers (cite them like [A1]):
${formatAnswers(qa)}

1. In 3-6 short lines, think out loud: what do these answers suggest? Reason as: Evidence [A#] -> Inference -> Hypothesis.
2. Give your best one-line guess: "A ___ for ___ that helps them ___".`;
}

export const BLIND_STRUCTURE_PROMPT = `Now fill in the JSON card from your reasoning above.
- guess: one sentence "A [kind of product] for [users] that helps them [benefit]" with real words
- evidence_chain: 2-4 rows, each with the answer IDs you cited (like A1), the evidence, and your inference
- confidence: 0-100
- unknowns: what the answers still do not tell us
Return only JSON.`;

// =====================================================================
// Tab 2 — Run the entire simulation. The detectives read the notes
// directly, guess, and propose follow-up questions for the RAG.
// =====================================================================

export function detectiveSystemPrompt(p: Persona): string {
  return `You are ${p.name}, one of four detectives guessing what product or service a startup is building.
You only see sticky notes from its Business Model Canvas. Your lens: ${p.lensDescription} (${lensBlocks(p)}).
Rules:
- Use ONLY the notes provided. Cite note IDs like [N07].
- Never invent a product name. Never mention a real brand unless it appears in the notes.
- Reason as: Evidence [IDs] -> Inference -> Hypothesis.
- If the notes don't say something, list it under unknowns.`;
}

export function detectiveUserPrompt(notes: Note[]): string {
  return `Notes you can see:
${formatNotes(notes)}

1. In 3-6 short lines, think out loud: what do these notes suggest?
2. Give your best one-line guess: "A ___ for ___ that helps them ___".
3. Write 3-5 follow-up questions to ask a knowledge base built from this canvas.
   Each must be specific and able to confirm or refute your guess.
   Bad: "What is the app?"  Good: "Which customer segment is listed as primary, and how big are they?"`;
}

/** Second turn: turn the streamed reasoning into the card JSON. */
export const STRUCTURE_PROMPT = `Now fill in the JSON card from your reasoning above.
- guess: one sentence "A [kind of product] for [users] that helps them [benefit]" with real words
- evidence_chain: 2-4 rows, each with note_ids you cited, the evidence, and your inference
- confidence: 0-100
- unknowns: what the notes do not tell us
- rag_followup_questions: 3-5 specific questions
Return only JSON.`;

// =====================================================================
// Both tabs — synthesis
// =====================================================================

export const SYNTH_SYSTEM_PROMPT = `You combine four detectives' guesses about a startup into one consensus and a plan for a prototype app.
Rules:
- Use only what the detectives wrote. Never invent a real brand name.
- product_name is a short made-up placeholder name.
- core_screens: 3-5 items, each "Screen name: purpose".
- features: 3-6 items, each tied to a value the detectives mention.
- integrations: generic data sources to MOCK, e.g. "weather forecast feed". No company names unless a detective wrote them.
- Keep each string under 40 words. Return only JSON.`;

export function synthUserPrompt(cards: { personId: PersonId; name: string; card: DetectiveCard }[]): string {
  const compact = cards.map(({ personId, name, card }) => ({
    person: personId,
    name,
    guess: card.guess,
    target_user: card.target_user,
    problem_solved: card.problem_solved,
    domain_and_location: card.domain_and_location,
    confidence: card.confidence,
    key_evidence: card.evidence_chain.slice(0, 3).map((e) => e.inference).filter(Boolean),
  }));
  return `Detective cards:
${JSON.stringify(compact, null, 1)}

Write the consensus guess as one sentence: "A [kind of product] for [users] that helps them [benefit]", with the brackets replaced by real words.
Then list where they agree, where they disagree, and fill the prototype sections.`;
}

const bullets = (items: string[], fallback: string): string =>
  items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${fallback}`;

/** Fixed AI Studio Build template. The model fills sections; the app stitches them. */
export function stitchAiStudioPrompt(s: AiStudioSections): string {
  const screens = s.core_screens.length
    ? s.core_screens.map((sc, i) => `${i + 1}. ${sc}`).join("\n")
    : "1. Home: overview of the main task";
  return `Build a working prototype web app.

Product: ${s.product_name || "Prototype"} (placeholder name)
One-line pitch: ${s.pitch}
Target users and context of use: ${s.users_and_context}
Primary platform: ${s.platform || "Responsive web app"}

Core screens:
${screens}

Key features (each maps to a value proposition):
${bullets(s.features, "Core workflow for the target user")}

Seed the UI with realistic sample data: ${s.sample_data}
Mock these data sources / integrations (no real API keys): ${s.integrations.length ? s.integrations.join(", ") : "none"}
Tone and visual direction: ${s.visual_direction || "Clean, friendly, accessible"}

Note: this prototype is based on an inferred guess from a Business Model Canvas, not an official spec.`;
}
