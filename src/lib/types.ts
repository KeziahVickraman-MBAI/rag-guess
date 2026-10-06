export type Block =
  | "key_partners" | "key_activities" | "key_resources"
  | "value_propositions" | "customer_relationships" | "channels"
  | "customer_segments" | "cost_structure" | "revenue_streams" | "unknown";

export type PersonId = 1 | 2 | 3 | 4;

export interface Note { id: string; text: string; block: Block; included: boolean; }

export interface EvidenceRow { note_ids: string[]; evidence: string; inference: string; }

export interface DetectiveCard {
  guess: string;
  target_user: string;
  problem_solved: string;
  domain_and_location: string;
  evidence_chain: EvidenceRow[];
  confidence: number;
  unknowns: string[];
  rag_followup_questions: string[];
}

export interface PersonState {
  personId: PersonId;
  retrievedNoteIds: string[];
  rawText: string;
  card: DetectiveCard | null;
  edited: boolean;
  status: "idle" | "running" | "done" | "error";
  error?: string;
}

export interface AiStudioSections {
  product_name: string;
  pitch: string;
  users_and_context: string;
  platform: string;
  core_screens: string[];
  features: string[];
  sample_data: string;
  integrations: string[];
  visual_direction: string;
}

export interface SynthesisOutput {
  consensus_guess: string;
  agreements: string[];
  disagreements: string[];
  sections: AiStudioSections;
}

export interface Consensus {
  consensus_guess: string;
  agreements: string[];
  disagreements: string[];
  aiStudioPrompt: string;
}

export interface Settings {
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  detectiveTemperature: number;
  synthTemperature: number;
  timeoutSec: number;
  mockMode: boolean;
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
