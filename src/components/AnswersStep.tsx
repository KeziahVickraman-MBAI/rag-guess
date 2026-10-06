import { useId, useState } from "react";
import { importAnswersCsv } from "../lib/answers";
import { personaById } from "../lib/personas";
import type { PersonState, QA } from "../lib/types";
import { inputCls } from "./ui";

interface Props {
  persons: PersonState[];
  onPersonsChange: (persons: PersonState[]) => void;
  onQuestionsChange: (personId: PersonState["personId"], qs: QA[]) => void;
}

/** Step 3: bring the RAG's answers back from R. */
export function AnswersStep({ persons, onPersonsChange, onQuestionsChange }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileId = useId();
  const total = persons.reduce((n, p) => n + p.questions.length, 0);
  const answered = persons.reduce((n, p) => n + p.questions.filter((q) => q.answer.trim()).length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={fileId}
          className={`rounded-md px-3 py-1.5 text-sm font-medium focus-within:ring-2 ${total === 0 ? "cursor-not-allowed bg-blue-300 text-white" : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"}`}>
          Import answers.csv
          <input id={fileId} type="file" accept=".csv,text/csv" className="sr-only" disabled={total === 0}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const r = importAnswersCsv(await f.text(), persons);
                onPersonsChange(r.persons);
                setMsg({
                  ok: true,
                  text: `Imported ${f.name}: ${r.matched} answer(s) matched` +
                    (r.added ? `, ${r.added} new question(s) added` : "") +
                    (r.unmatched ? `, ${r.unmatched} row(s) could not be matched` : "") + ".",
                });
              } catch (err) {
                setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
              }
            }} />
        </label>
        <span className="text-sm text-slate-600" role="status">
          {total === 0 ? "Generate questions in step 2 first." : `${answered} of ${total} questions answered.`}
        </span>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-md p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">Expected answers.csv format</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-slate-100">{`person,question,answer
person_1,"Which customer segment is primary?","Independent sports bars in Singapore..."
person_2,"...","..."`}</pre>
        <p className="mt-1">
          <code>person</code> can be <code>person_1</code>, <code>1</code> or the detective's name. Questions are matched by their text, so keep
          them as exported. If there's no <code>person</code> column, each answer is matched to whichever detective asked that question.
        </p>
      </details>

      {total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {persons.map((p) => p.questions.length > 0 && (
            <fieldset key={p.personId} className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Person {p.personId} — {personaById(p.personId).name}</legend>
              <ol className="space-y-3">
                {p.questions.map((q, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium text-slate-800">{i + 1}. {q.question || <em className="text-slate-400">(empty question)</em>}</p>
                    <textarea rows={2} aria-label={`Answer to person ${p.personId} question ${i + 1}`} placeholder="RAG answer (import answers.csv or paste here)"
                      className={`${inputCls} mt-1 field-sizing-content ${q.answer.trim() ? "" : "bg-amber-50"}`} value={q.answer}
                      onChange={(e) => onQuestionsChange(p.personId, p.questions.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                  </li>
                ))}
              </ol>
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}
