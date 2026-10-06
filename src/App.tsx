import { useRef, useState } from "react";
import { ConsensusPanel } from "./components/ConsensusPanel";
import { DetectiveCard } from "./components/DetectiveCard";
import { ExportPanel } from "./components/ExportPanel";
import { HelpBox } from "./components/HelpBox";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadStep } from "./components/UploadStep";
import { Button, Section } from "./components/ui";
import { planRetrieval, runDetective, synthesize, type EngineCtx } from "./lib/engine";
import { OllamaError } from "./lib/ollama";
import { personaById, PERSONAS } from "./lib/personas";
import { stitchAiStudioPrompt } from "./lib/prompts";
import { analysisNotes, parseTerms } from "./lib/redact";
import { emptyCard } from "./lib/schema";
import { emptyPerson, newSession, useSession } from "./lib/store";
import type { PersonId, PersonState } from "./lib/types";

type Busy = null | "detectives" | "synth";

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const needsHelp = (e: unknown): boolean => e instanceof OllamaError && (e.kind === "cors" || e.kind === "unreachable");
const isFatal = (e: unknown): boolean =>
  e instanceof OllamaError && ["cors", "unreachable", "model_missing", "aborted"].includes(e.kind);

export default function App() {
  const [session, setSession] = useSession();
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [synthError, setSynthError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const { settings } = session;
  const terms = parseTerms(session.redactTerms);
  const notes = analysisNotes(session.notes, terms);
  const readyCards = session.persons.filter((p) => p.card && p.card.guess.trim());

  const updatePerson = (id: PersonId, patch: Partial<PersonState> | ((p: PersonState) => Partial<PersonState>)): void =>
    setSession((s) => ({
      ...s,
      persons: s.persons.map((p) => (p.personId === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
    }));

  function startRun(kind: Exclude<Busy, null>): EngineCtx {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(kind);
    setShowHelp(false);
    return { settings, signal: ctrl.signal };
  }

  async function runPeople(ids: PersonId[]): Promise<void> {
    const toRun = ids.filter((id) => {
      const p = session.persons[id - 1];
      return !(p.edited && p.card) || window.confirm(`Person ${id} has your edits. Regenerate and lose them?`);
    });
    if (toRun.length === 0) return;
    if (notes.length === 0) { setNotice("No included notes — upload a CSV in step 1 first."); return; }
    const ctx = startRun("detectives");
    setNotice("");
    try {
      const plan = await planRetrieval(ctx, notes);
      setNotice(plan.notice ?? (plan.usedEmbeddings ? "Using embeddings: lens notes + top 3 similar notes per person." : ""));
      for (const id of toRun) {
        updatePerson(id, { status: "running", rawText: "", error: undefined, retrievedNoteIds: plan.byPerson[id].map((n) => n.id) });
        try {
          const res = await runDetective(ctx, personaById(id), plan.byPerson[id], (t) =>
            updatePerson(id, (p) => ({ rawText: p.rawText + t })));
          updatePerson(id, {
            rawText: res.rawText,
            card: res.card ?? emptyCard(),
            edited: false,
            status: res.card ? "done" : "error",
            error: res.error,
          });
        } catch (e) {
          updatePerson(id, (p) => ({ status: p.card ? "done" : "error", error: errorText(e) }));
          if (needsHelp(e)) setShowHelp(true);
          if (isFatal(e)) break;
        }
      }
    } catch (e) {
      setNotice(errorText(e));
      if (needsHelp(e)) setShowHelp(true);
    } finally {
      // Anything still "running" (e.g. queued behind a cancel) goes back to idle.
      setSession((s) => ({ ...s, persons: s.persons.map((p) => (p.status === "running" ? { ...p, status: p.card ? "done" : "idle" } : p)) }));
      setBusy(null);
    }
  }

  async function runSynthesis(): Promise<void> {
    if (session.consensus && !window.confirm("Regenerate the consensus? Your edits to it will be replaced.")) return;
    const ctx = startRun("synth");
    setSynthError("");
    try {
      const out = await synthesize(ctx, readyCards.map((p) => ({ personId: p.personId, card: p.card! })));
      setSession((s) => ({
        ...s,
        consensus: {
          consensus_guess: out.consensus_guess,
          agreements: out.agreements,
          disagreements: out.disagreements,
          aiStudioPrompt: stitchAiStudioPrompt(out.sections),
        },
      }));
    } catch (e) {
      setSynthError(errorText(e));
      if (needsHelp(e)) setShowHelp(true);
    } finally {
      setBusy(null);
    }
  }

  const cancel = (): void => abortRef.current?.abort();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">🕵️ BMC Detective</h1>
            <p className="text-sm text-slate-500">Four AI detectives guess the product behind a Business Model Canvas.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${settings.mockMode ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
            {settings.mockMode ? "Mock mode" : `Ollama · ${settings.chatModel}`}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" open={session.notes.length === 0}>
          <summary className="cursor-pointer text-lg font-semibold">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm text-white">0</span>
            Settings
          </summary>
          <div className="mt-4">
            <SettingsPanel settings={settings} onChange={(s) => setSession((x) => ({ ...x, settings: s }))} />
          </div>
        </details>

        <Section step={1} title="Upload & review notes">
          <UploadStep
            fileName={session.fileName}
            notes={session.notes}
            redactTerms={session.redactTerms}
            onLoad={(fileName, n) => setSession((s) => ({
              ...s, fileName, notes: n, persons: ([1, 2, 3, 4] as const).map(emptyPerson), consensus: null,
            }))}
            onNotesChange={(n) => setSession((s) => ({ ...s, notes: n }))}
            onRedactChange={(t) => setSession((s) => ({ ...s, redactTerms: t }))}
          />
        </Section>

        <Section step={2} title="Four detectives"
          right={busy === "detectives"
            ? <Button variant="danger" onClick={cancel}>Cancel</Button>
            : <Button variant="primary" disabled={busy !== null || notes.length === 0} onClick={() => runPeople([1, 2, 3, 4])}>Run all</Button>}>
          {notice && <p role="status" className="mb-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
          {showHelp && <div className="mb-3"><HelpBox chatModel={settings.chatModel} embedModel={settings.embedModel} /></div>}
          {notes.length === 0 && <p className="mb-3 text-sm text-slate-500">Upload a CSV in step 1 first.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {PERSONAS.map((persona) => {
              const person = session.persons[persona.id - 1];
              return (
                <DetectiveCard
                  key={persona.id}
                  persona={persona}
                  person={person}
                  notesSeen={person.retrievedNoteIds.map((id) => notes.find((n) => n.id === id)).filter((n) => n !== undefined)}
                  busy={busy !== null || notes.length === 0}
                  onRun={() => runPeople([persona.id])}
                  onCancel={cancel}
                  onCardChange={(card) => updatePerson(persona.id, { card, edited: true })}
                />
              );
            })}
          </div>
        </Section>

        <Section step={3} title="Consensus & AI Studio prompt">
          <ConsensusPanel
            consensus={session.consensus}
            readyCount={readyCards.length}
            busy={busy !== null}
            running={busy === "synth"}
            error={synthError}
            onSynthesize={runSynthesis}
            onCancel={cancel}
            onChange={(c) => setSession((s) => ({ ...s, consensus: c }))}
          />
        </Section>

        <Section step={4} title="Export / import">
          <ExportPanel
            session={session}
            onImport={(s) => setSession(s)}
            onReset={() => setSession(newSession(settings))}
          />
        </Section>
      </main>
      <footer className="pb-8 text-center text-xs text-slate-400">
        Runs entirely in your browser. LLM calls go straight from this page to your Ollama at {settings.baseUrl}.
      </footer>
    </div>
  );
}
