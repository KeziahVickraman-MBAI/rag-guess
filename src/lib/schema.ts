import type { AiStudioSections, DetectiveCard, EvidenceRow, SynthesisOutput } from "./types";

/** JSON schema passed to Ollama `format` for the detective structured pass. */
export const detectiveCardSchema = {
  type: "object",
  properties: {
    guess: { type: "string" },
    target_user: { type: "string" },
    problem_solved: { type: "string" },
    domain_and_location: { type: "string" },
    evidence_chain: {
      type: "array",
      items: {
        type: "object",
        properties: {
          note_ids: { type: "array", items: { type: "string" } },
          evidence: { type: "string" },
          inference: { type: "string" },
        },
        required: ["note_ids", "evidence", "inference"],
      },
    },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    unknowns: { type: "array", items: { type: "string" } },
    rag_followup_questions: { type: "array", items: { type: "string" } },
  },
  required: [
    "guess", "target_user", "problem_solved", "domain_and_location",
    "evidence_chain", "confidence", "unknowns", "rag_followup_questions",
  ],
} as const;

/** JSON schema passed to Ollama `format` for the synthesizer. */
export const synthesisSchema = {
  type: "object",
  properties: {
    consensus_guess: { type: "string" },
    agreements: { type: "array", items: { type: "string" } },
    disagreements: { type: "array", items: { type: "string" } },
    sections: {
      type: "object",
      properties: {
        product_name: { type: "string" },
        pitch: { type: "string" },
        users_and_context: { type: "string" },
        platform: { type: "string" },
        core_screens: { type: "array", items: { type: "string" } },
        features: { type: "array", items: { type: "string" } },
        sample_data: { type: "string" },
        integrations: { type: "array", items: { type: "string" } },
        visual_direction: { type: "string" },
      },
      required: [
        "product_name", "pitch", "users_and_context", "platform", "core_screens",
        "features", "sample_data", "integrations", "visual_direction",
      ],
    },
  },
  required: ["consensus_guess", "agreements", "disagreements", "sections"],
} as const;

// ---- Validation / coercion of model output (small models drift, so be lenient) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/** Pull note IDs like N7 / N07 / [N07] out of whatever the model put there. */
export function normalizeNoteIds(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(str).join(" ") : str(v);
  const ids = [...raw.matchAll(/N\s*0*(\d{1,3})/gi)].map((m) => `N${m[1].padStart(2, "0")}`);
  return [...new Set(ids)];
}

function coerceEvidence(v: unknown): EvidenceRow[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((r) => ({
    note_ids: normalizeNoteIds(r.note_ids),
    evidence: str(r.evidence),
    inference: str(r.inference),
  }));
}

export function coerceCard(v: unknown): DetectiveCard | null {
  if (!isObj(v)) return null;
  const card: DetectiveCard = {
    guess: str(v.guess),
    target_user: str(v.target_user),
    problem_solved: str(v.problem_solved),
    domain_and_location: str(v.domain_and_location),
    evidence_chain: coerceEvidence(v.evidence_chain),
    confidence: Math.max(0, Math.min(100, Math.round(Number(v.confidence) || 0))),
    unknowns: strArr(v.unknowns),
    rag_followup_questions: strArr(v.rag_followup_questions).slice(0, 5),
  };
  return card.guess ? card : null;
}

export function coerceSynthesis(v: unknown): SynthesisOutput | null {
  if (!isObj(v)) return null;
  const s: Obj = isObj(v.sections) ? v.sections : {};
  const sections: AiStudioSections = {
    product_name: str(s.product_name),
    pitch: str(s.pitch),
    users_and_context: str(s.users_and_context),
    platform: str(s.platform),
    core_screens: strArr(s.core_screens),
    features: strArr(s.features),
    sample_data: str(s.sample_data),
    integrations: strArr(s.integrations),
    visual_direction: str(s.visual_direction),
  };
  const out: SynthesisOutput = {
    consensus_guess: str(v.consensus_guess),
    agreements: strArr(v.agreements),
    disagreements: strArr(v.disagreements),
    sections,
  };
  return out.consensus_guess ? out : null;
}

export const emptyCard = (): DetectiveCard => ({
  guess: "", target_user: "", problem_solved: "", domain_and_location: "",
  evidence_chain: [], confidence: 0, unknowns: [], rag_followup_questions: [],
});
