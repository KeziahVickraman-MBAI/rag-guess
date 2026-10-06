import { useState } from "react";
import type { Consensus } from "../lib/types";
import { Button, StringList, TextField } from "./ui";

interface Props {
  consensus: Consensus | null;
  readyCount: number;
  busy: boolean;
  running: boolean;
  error: string;
  onSynthesize: () => void;
  onCancel: () => void;
  onChange: (c: Consensus) => void;
}

export function ConsensusPanel({ consensus, readyCount, busy, running, error, onSynthesize, onCancel, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof Consensus>(k: K, v: Consensus[K]): void => { if (consensus) onChange({ ...consensus, [k]: v }); };

  async function copy(): Promise<void> {
    if (!consensus) return;
    await navigator.clipboard.writeText(consensus.aiStudioPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <Button variant="danger" onClick={onCancel}>Cancel</Button>
        ) : (
          <Button variant="primary" disabled={busy || readyCount === 0} onClick={onSynthesize}>
            {consensus ? "Regenerate" : "Synthesize"}
          </Button>
        )}
        <span className="text-sm text-slate-500" role="status">
          {running ? "Combining the cards…" : `Uses your edited cards (${readyCount} of 4 ready).`}
        </span>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {consensus && (
        <>
          <TextField label="Consensus guess" value={consensus.consensus_guess} onChange={(v) => set("consensus_guess", v)} multiline />
          <div className="grid gap-4 md:grid-cols-2">
            <StringList label="Where they agree" items={consensus.agreements} onChange={(v) => set("agreements", v)} addLabel="Add agreement" />
            <StringList label="Where they disagree" items={consensus.disagreements} onChange={(v) => set("disagreements", v)} addLabel="Add disagreement" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="ai-studio-prompt" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Google AI Studio (Build mode) prompt
              </label>
              <Button onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Button>
            </div>
            <textarea id="ai-studio-prompt" rows={22}
              className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={consensus.aiStudioPrompt} onChange={(e) => set("aiStudioPrompt", e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Paste this into Google AI Studio → Build.</p>
          </div>
        </>
      )}
    </div>
  );
}
