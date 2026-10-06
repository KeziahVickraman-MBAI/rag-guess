import { useId, useState } from "react";
import { exportTranscriptMd } from "../lib/exportMd";
import { exportQuestionsR } from "../lib/exportR";
import { parseTerms } from "../lib/redact";
import { downloadText, parseSession, type Session } from "../lib/store";
import { Button } from "./ui";

export function ExportPanel({ session, onImport, onReset }: { session: Session; onImport: (s: Session) => void; onReset: () => void }) {
  const [msg, setMsg] = useState("");
  const importId = useId();
  const base = (session.fileName || "board").replace(/\.csv$/i, "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => downloadText("questions.R", exportQuestionsR(session.persons, session.fileName))}>
          Download questions.R
        </Button>
        <Button onClick={() => downloadText(`${base}_session.json`, JSON.stringify(session, null, 2), "application/json")}>
          Download session.json
        </Button>
        <Button onClick={() => downloadText(`${base}_transcript.md`, exportTranscriptMd({
          fileName: session.fileName, notes: session.notes, redactTerms: parseTerms(session.redactTerms),
          persons: session.persons, consensus: session.consensus,
        }), "text/markdown")}>
          Download transcript.md
        </Button>
        <label htmlFor={importId} className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 focus-within:ring-2">
          Import session.json
          <input id={importId} type="file" accept=".json,application/json" className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                onImport(parseSession(JSON.parse(await f.text())));
                setMsg(`Restored ${f.name}.`);
              } catch (err) {
                setMsg(`Could not import: ${err instanceof Error ? err.message : String(err)}`);
              }
            }} />
        </label>
        <Button variant="ghost" className="hover:text-red-600"
          onClick={() => window.confirm("Clear the whole session? Download session.json first if you want to keep it.") && onReset()}>
          Start over
        </Button>
      </div>
      {msg && <p role="status" className="text-sm text-slate-600">{msg}</p>}
      <p className="text-xs text-slate-500">
        In R: <code>source("questions.R")</code> gives you <code>rag_questions</code> (per person) and <code>all_questions</code>. Your session autosaves in this browser.
      </p>
    </div>
  );
}
