// ALL prompts live here. Tuned for a 3B model: short, concrete, small context.
import { BLOCK_LABELS } from "./blocks";
import type { Persona } from "./personas";
import type { AiStudioSections, DetectiveCard, Note, PersonId } from "./types";

export const formatNotes = (notes: Note[]): string =>
  notes.map((n) => `${n.id} | ${n.block} | ${n.text}`).join("\n");

export function detectiveSystemPrompt(p: Persona): string {
  return `You are ${p.name}, one of four detectives guessing what product or service a startup is building.
You only see sticky notes from its Business Model Canvas. Your lens: ${p.lensDescription} (${p.lens.map((b) => BLOCK_LABELS[b]).join(", ")}).
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
- guess: "A ___ for ___ that helps them ___"
- evidence_chain: 2-4 rows, each with note_ids you cited, the evidence, and your inference
- confidence: 0-100
- unknowns: what the notes do not tell us
- rag_followup_questions: 3-5 specific questions
Return only JSON.`;

export const STRICT_PROMPT =
  "Return only JSON matching the schema. Use the notes above. Keep each string under 30 words.";

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

Write the consensus guess ("A ___ for ___ that helps them ___"), where they agree, where they disagree, and fill the prototype sections.`;
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
