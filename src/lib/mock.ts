// Deterministic fake responses so the whole flow works without Ollama.
import { BLOCK_LABELS } from "./blocks";
import type { Persona } from "./personas";
import type { Block, DetectiveCard, Note, PersonId, SynthesisOutput } from "./types";

const short = (s: string, words = 10): string => {
  const w = s.replace(/^(primary|secondary|tertiary):\s*/i, "").split(/\s+/);
  return w.slice(0, words).join(" ") + (w.length > words ? "…" : "");
};
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const firstIn = (notes: Note[], blocks: Block[]): Note | undefined => notes.find((n) => blocks.includes(n.block));

export function mockDetective(persona: Persona, notes: Note[]): { rawText: string; card: DetectiveCard } {
  const seg = firstIn(notes, ["customer_segments", "channels"]) ?? notes[0];
  const val = firstIn(notes, ["value_propositions", "key_activities", "revenue_streams"]) ?? notes[1] ?? notes[0];
  const who = seg ? short(seg.text, 8) : "an unclear audience";
  const what = val ? lowerFirst(short(val.text, 10)) : "do something the notes don't make clear";
  const guess = `A digital service for ${lowerFirst(who)} that helps them ${what}`;
  const picks = notes.slice(0, 3);

  const evidence_chain = picks.map((n) => ({
    note_ids: [n.id],
    evidence: short(n.text, 14),
    inference: `Points to the ${BLOCK_LABELS[n.block].toLowerCase()} of the business.`,
  }));
  const missing = persona.lens.filter((b) => !notes.some((n) => n.block === b));
  const unknowns = [
    ...missing.map((b) => `No notes about ${BLOCK_LABELS[b].toLowerCase()}.`),
    "The product's actual name and launch status.",
  ];
  const rag_followup_questions = [
    `Which ${persona.lens.map((b) => BLOCK_LABELS[b].toLowerCase()).join(" or ")} note matters most to the business?`,
    seg ? `How exactly does "${short(seg.text, 6)}" use the product day to day?` : "Who is the primary customer segment?",
    val ? `What evidence supports the claim "${short(val.text, 6)}"?` : "What is the main value proposition?",
    "Is the product a mobile app, a web app, or a service delivered by people?",
  ];
  const card: DetectiveCard = {
    guess,
    target_user: who,
    problem_solved: what,
    domain_and_location: picks.map((n) => short(n.text, 4)).join("; ") || "Unknown",
    evidence_chain,
    confidence: 40 + persona.id * 8,
    unknowns,
    rag_followup_questions,
  };
  const rawText = [
    `(mock mode) ${persona.name} is reading ${notes.length} notes.`,
    ...picks.map((n) => `Evidence [${n.id}] -> ${short(n.text, 8)} -> relevant to ${BLOCK_LABELS[n.block]}.`),
    `Hypothesis: ${guess}.`,
  ].join("\n");
  return { rawText, card };
}

export function mockSynthesis(cards: { personId: PersonId; card: DetectiveCard }[]): SynthesisOutput {
  const best = [...cards].sort((a, b) => b.card.confidence - a.card.confidence)[0];
  const guess = best?.card.guess ?? "A service the canvas does not make clear";
  return {
    consensus_guess: guess,
    agreements: [`The highest-confidence detective (Person ${best?.personId ?? "?"}) sets the guess; the others mostly fit it.`],
    disagreements: cards.map((c) => `Person ${c.personId} sees the target user as: ${c.card.target_user || "unclear"}.`),
    sections: {
      product_name: "Project Sleuth",
      pitch: guess,
      users_and_context: best?.card.target_user ?? "Unclear",
      platform: "Responsive web app (desktop first, mobile view)",
      core_screens: ["Dashboard: overview of today's key information", "Detail: drill into one item", "Settings: account and preferences"],
      features: cards.map((c) => c.card.problem_solved).filter(Boolean).slice(0, 4),
      sample_data: "10-20 realistic rows based on the target users and the domain above",
      integrations: ["Mocked external data feed"],
      visual_direction: "Clean, friendly, high contrast, large tap targets",
    },
  };
}

/** Emit text in small chunks, like a streaming model. */
export async function mockStream(text: string, onToken: (t: string) => void, signal: AbortSignal, delayMs = 15): Promise<void> {
  const chunks = text.match(/\S+\s*/g) ?? [];
  for (const c of chunks) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    onToken(c);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}
