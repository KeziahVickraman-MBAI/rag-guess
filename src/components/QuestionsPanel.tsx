import { BLOCK_LABELS } from "../lib/blocks";
import type { Persona } from "../lib/personas";
import type { Note, PersonState, QA } from "../lib/types";
import { Button, inputCls, move, RowControls } from "./ui";

const COLORS = ["border-sky-400", "border-emerald-400", "border-amber-400", "border-violet-400"];

interface Props {
  persona: Persona;
  person: PersonState;
  notesSeen: Note[];
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  onQuestionsChange: (qs: QA[]) => void;
}

/** Step 2: one detective's questions for the RAG. No guess yet. */
export function QuestionsPanel({ persona, person, notesSeen, busy, onRun, onCancel, onQuestionsChange }: Props) {
  const running = person.qStatus === "running";
  const qs = person.questions;
  const hasRun = qs.length > 0 || person.qStatus !== "idle";

  return (
    <article className={`flex flex-col gap-3 rounded-xl border-t-4 bg-white p-4 shadow-sm ring-1 ring-slate-200 ${COLORS[persona.id - 1]}`}
      aria-label={`Person ${persona.id} questions`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">Person {persona.id} — {persona.name}</h3>
          <p className="text-xs text-slate-500">Lens: {persona.lens.map((b) => BLOCK_LABELS[b]).join(", ")}</p>
        </div>
        {running ? (
          <Button variant="danger" onClick={onCancel}>Cancel</Button>
        ) : (
          <Button variant={hasRun ? "secondary" : "primary"} disabled={busy} onClick={onRun}>{hasRun ? "Regenerate" : "Ask questions"}</Button>
        )}
      </header>

      {person.qError && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{person.qError}</p>}

      {(running || person.qRawText) && (
        <details open={running} className="rounded-md bg-slate-50 p-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Thinking out loud {running && <span className="ml-1 animate-pulse text-blue-600">● generating</span>}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-slate-700" aria-live="polite">{person.qRawText || "…"}</p>
        </details>
      )}

      {notesSeen.length > 0 && (
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

      {!hasRun && !running && <p className="text-sm text-slate-500">No questions yet.</p>}

      {(hasRun || qs.length > 0) && !running && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Questions for the RAG</legend>
          <ol className="space-y-1">
            {qs.map((q, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                <textarea rows={1} aria-label={`Person ${persona.id} question ${i + 1}`} className={`${inputCls} field-sizing-content`}
                  value={q.question}
                  onChange={(e) => onQuestionsChange(qs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
                <RowControls index={i} length={qs.length} label={`question ${i + 1}`}
                  onMove={(to) => onQuestionsChange(move(qs, i, to))}
                  onRemove={() => onQuestionsChange(qs.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ol>
          <Button variant="ghost" className="mt-1 text-blue-700" onClick={() => onQuestionsChange([...qs, { question: "", answer: "" }])}>
            + Add question
          </Button>
        </fieldset>
      )}
    </article>
  );
}
