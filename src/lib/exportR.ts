import type { PersonState } from "./types";

/** A double-quoted R string literal. UTF-8 is kept as-is. */
export function rString(s: string): string {
  const clean = s
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/\t/g, " ");
  return `"${clean}"`;
}

export function exportQuestionsR(persons: PersonState[], sourceName: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const source = (sourceName || "board").replace(/[\r\n]/g, " ");
  const entries = ([1, 2, 3, 4] as const).map((id) => {
    const p = persons.find((x) => x.personId === id);
    const qs = (p?.card?.rag_followup_questions ?? []).map((q) => q.trim()).filter(Boolean);
    const value = qs.length ? `c(${qs.map(rString).join(", ")})` : "character(0)";
    return `  person_${id} = ${value}`;
  });
  return `# BMC Detective — generated ${stamp} from ${source}
rag_questions <- list(
${entries.join(",\n")}
)
all_questions <- unlist(rag_questions, use.names = FALSE)
`;
}
