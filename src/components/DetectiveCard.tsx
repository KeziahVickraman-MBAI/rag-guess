import { useId } from "react";
import { answerIds } from "../lib/answers";
import { BLOCK_LABELS } from "../lib/blocks";
import { ungroundedIds } from "../lib/grounding";
import type { Persona } from "../lib/personas";
import { emptyCard, normalizeNoteIds } from "../lib/schema";
import type { DetectiveCard as Card, EvidenceRow, Note, PersonState } from "../lib/types";
import { Button, DraftInput, inputCls, move, RowControls, StringList, TextField } from "./ui";

const COLORS = ["border-sky-400", "border-emerald-400", "border-amber-400", "border-violet-400"];

interface Props {
  persona: Persona;
  person: PersonState;
  notesSeen: Note[];
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  onCardChange: (card: Card) => void;
}

export function DetectiveCard({ persona, person, notesSeen, busy, onRun, onCancel, onCardChange }: Props) {
  const running = person.status === "running";
  const card = person.card;
  const answered = person.questions.filter((q) => q.answer.trim());
  const bad = card ? ungroundedIds(card, [...person.retrievedNoteIds, ...answerIds(person)]) : new Set<string>();
  const set = <K extends keyof Card>(k: K, v: Card[K]): void => { if (card) onCardChange({ ...card, [k]: v }); };
  const setRow = (i: number, patch: Partial<EvidenceRow>): void => {
    if (card) set("evidence_chain", card.evidence_chain.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const confId = useId();

  return (
    <article className={`flex flex-col gap-4 rounded-xl border-t-4 bg-white p-4 shadow-sm ring-1 ring-slate-200 ${COLORS[persona.id - 1]}`}
      aria-label={`Person ${persona.id}: ${persona.name}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">Person {persona.id} — {persona.name}</h3>
          <p className="text-xs text-slate-500">Lens: {persona.lens.map((b) => BLOCK_LABELS[b]).join(", ")}</p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="danger" onClick={onCancel}>Cancel</Button>
          ) : (
            <Button variant={card ? "secondary" : "primary"} disabled={busy} onClick={onRun}>{card ? "Regenerate" : "Run"}</Button>
          )}
        </div>
      </header>

      {person.error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{person.error}</p>}

      {(running || person.rawText) && (
        <details open={running || !card} className="rounded-md bg-slate-50 p-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Thinking out loud {running && <span className="ml-1 animate-pulse text-blue-600">● generating</span>}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-slate-700" aria-live="polite">{person.rawText || "…"}</p>
        </details>
      )}

      {person.retrievedNoteIds.length > 0 && (
        <details className="rounded-md bg-slate-50 p-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes this person saw ({notesSeen.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {notesSeen.map((n) => (
              <li key={n.id}><span className="font-mono text-xs text-slate-500">{n.id}</span>{" "}
                <span className="text-xs text-slate-400">[{BLOCK_LABELS[n.block]}]</span> {n.text}</li>
            ))}
          </ul>
        </details>
      )}

      {answered.length > 0 && (
        <details className="rounded-md bg-slate-50 p-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            RAG answers this person used ({answered.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {answered.map((q, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-slate-500">A{i + 1}</span> <strong>{q.question}</strong>
                <p className="whitespace-pre-wrap text-slate-700">{q.answer}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {!card && !running && person.status === "idle" && (
        <p className="text-sm text-slate-500">Not run yet.</p>
      )}
      {!card && !running && person.status === "error" && (
        <Button onClick={() => onCardChange(emptyCard())}>Fill the card by hand</Button>
      )}

      {card && (
        <div className="space-y-3">
          <TextField label='Guess — "A ___ for ___ that helps them ___"' value={card.guess} onChange={(v) => set("guess", v)} multiline />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Target user" value={card.target_user} onChange={(v) => set("target_user", v)} multiline />
            <TextField label="Problem solved" value={card.problem_solved} onChange={(v) => set("problem_solved", v)} multiline />
          </div>
          <TextField label="Domain and location" value={card.domain_and_location} onChange={(v) => set("domain_and_location", v)} />
          <div>
            <label htmlFor={confId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confidence: {card.confidence}/100
            </label>
            <input id={confId} type="range" min={0} max={100} className="w-full" value={card.confidence}
              onChange={(e) => set("confidence", Number(e.target.value))} />
          </div>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence chain</legend>
            <ol className="space-y-2">
              {card.evidence_chain.map((row, i) => (
                <li key={i} className="rounded-md border border-slate-200 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <DraftInput key={row.note_ids.join(",")} aria-label={`Evidence ${i + 1} note IDs`} className={`${inputCls} w-40 font-mono`}
                      value={row.note_ids.join(", ")} placeholder="N01, A1"
                      onCommit={(v) => setRow(i, { note_ids: normalizeNoteIds(v) })} />
                    <div className="flex flex-1 flex-wrap gap-1">
                      {row.note_ids.map((id) => bad.has(id) ? (
                        <span key={id} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title="Not one of the notes or answers this person saw">
                          {id} · not retrieved
                        </span>
                      ) : (
                        <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{id}</span>
                      ))}
                    </div>
                    <RowControls index={i} length={card.evidence_chain.length} label={`evidence ${i + 1}`}
                      onMove={(to) => set("evidence_chain", move(card.evidence_chain, i, to))}
                      onRemove={() => set("evidence_chain", card.evidence_chain.filter((_, j) => j !== i))} />
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    <textarea rows={2} aria-label={`Evidence ${i + 1}`} placeholder="Evidence" className={inputCls}
                      value={row.evidence} onChange={(e) => setRow(i, { evidence: e.target.value })} />
                    <textarea rows={2} aria-label={`Inference ${i + 1}`} placeholder="→ Inference" className={inputCls}
                      value={row.inference} onChange={(e) => setRow(i, { inference: e.target.value })} />
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="ghost" className="mt-1 text-blue-700"
              onClick={() => set("evidence_chain", [...card.evidence_chain, { note_ids: [], evidence: "", inference: "" }])}>
              + Add evidence
            </Button>
          </fieldset>

          <StringList label="Unknowns" items={card.unknowns} onChange={(v) => set("unknowns", v)} addLabel="Add unknown" />
          {person.edited && <p className="text-xs text-slate-400">Edited by you.</p>}
        </div>
      )}
    </article>
  );
}
