import { useId, useState } from "react";
import { parseMiroCsv, unknownShare } from "../lib/csv";
import { parseTerms, redact } from "../lib/redact";
import type { Note } from "../lib/types";
import { NotesTable } from "./NotesTable";
import { Button, inputCls } from "./ui";

const SAMPLES = [
  { file: "board_a_screening.csv", label: "Board A (screening)" },
  { file: "board_b_farm.csv", label: "Board B (farm)" },
  { file: "board_headerless.csv", label: "Headerless" },
];

interface Props {
  fileName: string;
  notes: Note[];
  redactTerms: string;
  onLoad: (fileName: string, notes: Note[]) => void;
  onNotesChange: (notes: Note[]) => void;
  onRedactChange: (terms: string) => void;
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
}

export function UploadStep({ fileName, notes, redactTerms, onLoad, onNotesChange, onRedactChange, revealed, onRevealedChange }: Props) {
  const [info, setInfo] = useState<string>("");
  const [error, setError] = useState<string>("");
  const fileId = useId();
  const redactId = useId();

  function load(name: string, text: string): void {
    try {
      const r = parseMiroCsv(text);
      onLoad(name, r.notes);
      setError("");
      setInfo(`Text column: "${r.textColumn}". Block column: ${r.tagColumn ? `"${r.tagColumn}"` : "none (blocks read from headings or keywords)"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadSample(file: string): Promise<void> {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
    load(file, await res.text());
  }

  const terms = parseTerms(redactTerms);
  const included = notes.filter((n) => n.included);
  const unknown = unknownShare(notes);
  const changed = terms.length ? included.filter((n) => redact(n.text, terms) !== n.text) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={fileId} className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-within:ring-2">
          Upload Miro CSV
          <input id={fileId} type="file" accept=".csv,text/csv" className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(f.name, await f.text());
              e.target.value = "";
            }} />
        </label>
        <span className="text-sm text-slate-500">or try a sample:</span>
        {SAMPLES.map((s) => <Button key={s.file} onClick={() => loadSample(s.file)}>{s.label}</Button>)}
      </div>
      {fileName && (
        <p className="text-sm text-slate-600">
          Current board: <strong>{fileName}</strong> — {notes.length} notes loaded.{revealed && info && ` ${info}`}
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {notes.length > 0 && !revealed && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <span aria-hidden className="text-2xl">🙈</span>
          <p className="flex-1 text-sm text-slate-600">
            The canvas is hidden so nobody sees it before the detectives have asked their questions.
          </p>
          <Button variant="primary" onClick={() => onRevealedChange(true)}>Reveal</Button>
        </div>
      )}

      {notes.length > 0 && revealed && (
        <>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onRevealedChange(false)}>Hide the canvas</Button>
          </div>
          {unknown > 0.3 && (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              ⚠ {Math.round(unknown * 100)}% of included notes have block <strong>Unknown</strong>. The detectives rely on blocks to
              decide what they see — set the block for the highlighted rows below.
            </p>
          )}
          <p className="text-sm text-slate-600">{included.length} of {notes.length} notes included.</p>
          <NotesTable notes={notes} onChange={onNotesChange} />

          <div>
            <label htmlFor={redactId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Redact terms (comma-separated product names, URLs)
            </label>
            <input id={redactId} className={inputCls} value={redactTerms} placeholder="e.g. MatchDay Pro, matchday.sg"
              onChange={(e) => onRedactChange(e.target.value)} />
            {terms.length > 0 && (
              <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="mb-1 font-semibold">Redaction preview — {changed.length} note(s) changed:</p>
                {changed.length === 0 ? <p className="text-slate-500">No matches.</p> : (
                  <ul className="space-y-1">
                    {changed.map((n) => <li key={n.id}><span className="font-mono text-xs text-slate-500">{n.id}</span> {redact(n.text, terms)}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
