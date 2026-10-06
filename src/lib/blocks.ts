import type { Block } from "./types";

export const BLOCKS: Block[] = [
  "key_partners", "key_activities", "key_resources",
  "value_propositions", "customer_relationships", "channels",
  "customer_segments", "cost_structure", "revenue_streams", "unknown",
];

export const BLOCK_LABELS: Record<Block, string> = {
  key_partners: "Key Partners",
  key_activities: "Key Activities",
  key_resources: "Key Resources",
  value_propositions: "Value Propositions",
  customer_relationships: "Customer Relationships",
  channels: "Channels",
  customer_segments: "Customer Segments",
  cost_structure: "Cost Structure",
  revenue_streams: "Revenue Streams",
  unknown: "Unknown",
};

// Aliases are compared after lowercasing and removing everything except letters.
const ALIASES: Record<Exclude<Block, "unknown">, string[]> = {
  key_partners: ["keypartners", "keypartner", "partners", "partner", "partnerships", "kp"],
  key_activities: ["keyactivities", "keyactivity", "activities", "activity", "ka"],
  key_resources: ["keyresources", "keyresource", "resources", "resource", "kr"],
  value_propositions: ["valuepropositions", "valueproposition", "valueprop", "valueprops", "value", "vp", "vps"],
  customer_relationships: ["customerrelationships", "customerrelationship", "relationships", "relationship", "cr"],
  channels: ["channels", "channel", "ch"],
  customer_segments: ["customersegments", "customersegment", "segments", "segment", "customers", "cs"],
  cost_structure: ["coststructure", "costs", "cost", "coststructures"],
  revenue_streams: ["revenuestreams", "revenuestream", "revenue", "revenues", "rs"],
};

const normalizeTag = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

/** Match a free-text tag/column value (e.g. "Key Partners", "key_partners", "VP") to a block. */
export function matchBlockTag(raw: string): Block | null {
  // A cell may hold several tags: "Board A, Key Partners"
  for (const part of raw.split(/[,;|]/)) {
    const tag = normalizeTag(part);
    if (!tag) continue;
    for (const [block, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(tag)) return block as Block;
    }
  }
  return null;
}

const KEYWORDS: Record<Exclude<Block, "unknown">, string[]> = {
  key_partners: ["partner", "provider", "supplier", "distributor", "association", "gateway", "alliance", "vendor", "network"],
  key_activities: ["fetch", "process", "generate", "run ", "publish", "integration", "execution", "mapping", "develop", "maintain", "score", "operate"],
  key_resources: ["data", "engine", "template", "knowledge graph", "ontology", "stack", "rules", "history", "team", "ip", "platform", "cache"],
  value_propositions: ["save", "know", "cut", "avoid", "faster", "easier", "guidance", "alerts", "decisions", "helps", "reduce", "better"],
  customer_relationships: ["self-service", "account manager", "support", "onboarding", "assistant", "community", "review call", "automated", "personal"],
  channels: ["web", "mobile", "email", "whatsapp", "sms", "app", "sales", "dashboard", "website", "social media", "store"],
  customer_segments: ["primary", "secondary", "tertiary", "segment", "owners", "families", "farmers", "students", "smes", "users", "officers"],
  cost_structure: ["cost", "hosting", "salary", "salaries", "expense", "break-even", "fees paid", "usage", "storage", "quota", "spend"],
  revenue_streams: ["subscription", "revenue", "freemium", "pricing", "sell", "licensing to", "setup fee", "premium", "commission", "ads"],
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Keywords match whole words with an optional plural: "subscription" matches "subscriptions", "ip" doesn't match "ipsum".
const KEYWORD_RES = Object.entries(KEYWORDS).map(
  ([block, words]) => [block as Block, words.map((w) => new RegExp(`(^|[^a-z])${escapeRe(w.trim())}(s|es)?($|[^a-z])`, "i"))] as const,
);

/** Keyword heuristic: block with the most keyword hits, or "unknown" on zero hits or a tie. */
export function guessBlock(text: string): Block {
  let best: Block = "unknown";
  let bestScore = 0;
  let tie = false;
  for (const [block, res] of KEYWORD_RES) {
    const score = res.reduce((n, re) => (re.test(text) ? n + 1 : n), 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return tie ? "unknown" : best;
}
