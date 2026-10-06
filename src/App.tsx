import { useRef, useState, type ReactNode } from "react";
import { AnswersStep } from "./components/AnswersStep";
import { ConsensusPanel } from "./components/ConsensusPanel";
import { DetectiveCard } from "./components/DetectiveCard";
import { ExportPanel } from "./components/ExportPanel";
import { HelpBox } from "./components/HelpBox";
import { QuestionsPanel } from "./components/QuestionsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadStep } from "./components/UploadStep";
import { Button, Section } from "./components/ui";
import { planRetrieval, runBlindGuess, runDetective, runQuestions, synthesize, type EngineCtx } from "./lib/engine";
import { exportQuestionsR } from "./lib/exportR";
import { OllamaError } from "./lib/ollama";
import { personaById, PERSONAS } from "./lib/personas";
import { stitchAiStudioPrompt } from "./lib/prompts";
import { analysisNotes, parseTerms } from "./lib/redact";
import { emptyCard } from "./lib/schema";
import { downloadText, emptyPersons, newSession, useSession, type Session } from "./lib/store";
import type { Consensus, Note, PersonId, PersonState, QA } from "./lib/types";

/** "qf" = tab 1, questions first (blind detectives). "sim" = tab 2, the entire simulation. */
type Tab = "qf" | "sim";
type Busy = null | "questions" | "blind" | "sim" | "synth-qf" | "synth-sim";

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const needsHelp = (e: unknown): boolean => e instanceof OllamaError && (e.kind === "cors" || e.kind === "unreachable");
const isFatal = (e: unknown): boolean =>
  e instanceof OllamaError && ["cors", "unreachable", "model_missing", "aborted"].includes(e.kind);

const personsOf = (s: Session, tab: Tab): PersonState[] => (tab === "qf" ? s.persons : s.sim.persons);
const consensusOf = (s: Session, tab: Tab): Consensus | null => (tab === "qf" ? s.consensus : s.sim.consensus);
const withPersons = (s: Session, tab: Tab, persons: PersonState[]): Session =>
  tab === "qf" ? { ...s, persons } : { ...s, sim: { ...s.sim, persons } };
const withConsensus = (s: Session, tab: Tab, consensus: Consensus | null): Session =>
  tab === "qf" ? { ...s, consensus } : { ...s, sim: { ...s.sim, consensus } };
const settle = (ps: PersonState[]): PersonState[] =>
  ps.map((p) => ({
    ...p,
    qStatus: p.qStatus === "running" ? (p.questions.length ? "done" : "idle") : p.qStatus,
    status: p.status === "running" ? (p.card ? "done" : "idle") : p.status,
  }));

function TabButton({ id, active, onSelect, children }: { id: Tab; active: boolean; onSelect: (t: Tab) => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" id={`tab-${id}`} aria-selected={active} aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold ${active ? "border-slate-200 bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {children}
    </button>
  );
}

export default function App() {
  const [session, setSession] = useSession();
  const [tab, setTab] = useState<Tab>("qf");
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [synthError, setSynthError] = useState<Record<Tab, string>>({ qf: "", sim: "" });
  const abortRef = useRef<AbortController | null>(null);

  const { settings } = session;
  const terms = parseTerms(session.redactTerms);
  const notes = analysisNotes(session.notes, terms);
  const qf = session.persons;
  const sim = session.sim.persons;
  const questionCount = qf.reduce((n, p) => n + p.questions.filter((q) => q.question.trim()).length, 0);
  const answerCount = qf.reduce((n, p) => n + p.questions.filter((q) => q.answer.trim()).length, 0);

  const updatePerson = (t: Tab, id: PersonId, patch: Partial<PersonState> | ((p: PersonState) => Partial<PersonState>)): void =>
    setSession((s) => withPersons(s, t, personsOf(s, t).map((p) =>
      (p.personId === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p))));

  const notesById = new Map(notes.map((n) => [n.id, n]));
  const seenBy = (p: PersonState): Note[] => p.retrievedNoteIds.map((id) => notesById.get(id)).filter((n) => n !== undefined);

  function startRun(kind: Exclude<Busy, null>): EngineCtx {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(kind);
    setShowHelp(false);
    setNotice("");
    return { settings, signal: ctrl.signal };
  }
  const cancel = (): void => abortRef.current?.abort();

  /** Run the four detectives one after another; stop on connection-level errors. */
  async function runSequence<P>(
    kind: "questions" | "blind" | "sim",
    ids: PersonId[],
    prepare: (ctx: EngineCtx) => Promise<P>,
    one: (ctx: EngineCtx, id: PersonId, prep: P) => Promise<void>,
    onError: (id: PersonId, msg: string) => void,
  ): Promise<void> {
    const ctx = startRun(kind);
    try {
      const prep = await prepare(ctx);
      for (const id of ids) {
        try {
          await one(ctx, id, prep);
        } catch (e) {
          onError(id, errorText(e));
          if (needsHelp(e)) setShowHelp(true);
          if (isFatal(e)) break;
        }
      }
    } catch (e) {
      setNotice(errorText(e));
      if (needsHelp(e)) setShowHelp(true);
    } finally {
      // Anything still "running" (e.g. queued behind a cancel) goes back to rest.
      setSession((s) => ({ ...s, persons: settle(s.persons), sim: { ...s.sim, persons: settle(s.sim.persons) } }));
      setBusy(null);
    }
  }

  // ---- Tab 1: questions first ----

  async function askQuestions(ids: PersonId[]): Promise<void> {
    const existing = ids.filter((id) => qf[id - 1].questions.length > 0);
    const hasAnswers = existing.some((id) => qf[id - 1].questions.some((q) => q.answer.trim()));
    if (existing.length && !window.confirm(
      `Replace the questions${hasAnswers ? " and imported answers" : ""} for person ${existing.join(", ")}?`,
    )) return;
    await runSequence("questions", ids, async () => undefined, async (ctx, id) => {
      updatePerson("qf", id, { qStatus: "running", qRawText: "", qError: undefined });
      const res = await runQuestions(ctx, personaById(id), (t) => updatePerson("qf", id, (p) => ({ qRawText: p.qRawText + t })));
      updatePerson("qf", id, {
        qRawText: res.rawText,
        questions: res.questions.map((question) => ({ question, answer: "" })),
        qStatus: res.error ? "error" : "done",
        qError: res.error,
      });
    }, (id, msg) => updatePerson("qf", id, (p) => ({ qStatus: p.questions.length ? "done" : "error", qError: msg })));
  }

  async function runBlind(ids: PersonId[]): Promise<void> {
    const toRun = ids.filter((id) => {
      const p = qf[id - 1];
      return !(p.edited && p.card) || window.confirm(`Person ${id} has your edits. Regenerate and lose them?`);
    });
    if (toRun.length === 0) return;
    await runSequence("blind", toRun, async () => undefined, async (ctx, id) => {
      updatePerson("qf", id, { status: "running", rawText: "", error: undefined });
      const res = await runBlindGuess(ctx, personaById(id), qf[id - 1].questions,
        (t) => updatePerson("qf", id, (p) => ({ rawText: p.rawText + t })));
      updatePerson("qf", id, { rawText: res.rawText, card: res.card ?? emptyCard(), edited: false, status: res.card ? "done" : "error", error: res.error });
    }, (id, msg) => updatePerson("qf", id, (p) => ({ status: p.card ? "done" : "error", error: msg })));
  }

  // ---- Tab 2: the entire simulation ----

  async function runSim(ids: PersonId[]): Promise<void> {
    const toRun = ids.filter((id) => {
      const p = sim[id - 1];
      return !(p.edited && p.card) || window.confirm(`Person ${id} has your edits. Regenerate and lose them?`);
    });
    if (toRun.length === 0) return;
    if (notes.length === 0) { setNotice("No included notes — upload a CSV in step 1 first."); return; }
    await runSequence("sim", toRun, async (ctx) => {
      const plan = await planRetrieval(ctx, notes);
      setNotice(plan.notice ?? (plan.usedEmbeddings ? "Using embeddings: lens notes + top 3 similar notes per person." : ""));
      return plan;
    }, async (ctx, id, plan) => {
      updatePerson("sim", id, { status: "running", rawText: "", error: undefined, retrievedNoteIds: plan.byPerson[id].map((n) => n.id) });
      const res = await runDetective(ctx, personaById(id), plan.byPerson[id],
        (t) => updatePerson("sim", id, (p) => ({ rawText: p.rawText + t })));
      updatePerson("sim", id, {
        rawText: res.rawText,
        card: res.card ?? emptyCard(),
        questions: (res.questions ?? []).map((question) => ({ question, answer: "" })),
        edited: false,
        status: res.card ? "done" : "error",
        error: res.error,
      });
    }, (id, msg) => updatePerson("sim", id, (p) => ({ status: p.card ? "done" : "error", error: msg })));
  }

  // ---- Both tabs ----

  async function runSynthesis(t: Tab): Promise<void> {
    if (consensusOf(session, t) && !window.confirm("Regenerate the consensus? Your edits to it will be replaced.")) return;
    const ready = personsOf(session, t).filter((p) => p.card && p.card.guess.trim());
    const ctx = startRun(t === "qf" ? "synth-qf" : "synth-sim");
    setSynthError((e) => ({ ...e, [t]: "" }));
    try {
      const out = await synthesize(ctx, ready.map((p) => ({ personId: p.personId, card: p.card! })));
      setSession((s) => withConsensus(s, t, {
        consensus_guess: out.consensus_guess,
        agreements: out.agreements,
        disagreements: out.disagreements,
        aiStudioPrompt: stitchAiStudioPrompt(out.sections),
      }));
    } catch (e) {
      setSynthError((x) => ({ ...x, [t]: errorText(e) }));
      if (needsHelp(e)) setShowHelp(true);
    } finally {
      setBusy(null);
    }
  }

  const downloadQuestions = (persons: PersonState[]): void =>
    downloadText("questions.R", exportQuestionsR(persons, session.fileName));

  const status = (notice || showHelp) && (
    <div className="space-y-3">
      {notice && <p role="status" className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
      {showHelp && <HelpBox chatModel={settings.chatModel} embedModel={settings.embedModel} />}
    </div>
  );

  const consensusSection = (t: Tab, step: number) => (
    <Section step={step} title="Consensus & AI Studio prompt">
      <ConsensusPanel
        consensus={consensusOf(session, t)}
        readyCount={personsOf(session, t).filter((p) => p.card && p.card.guess.trim()).length}
        busy={busy !== null}
        running={busy === (t === "qf" ? "synth-qf" : "synth-sim")}
        error={synthError[t]}
        onSynthesize={() => runSynthesis(t)}
        onCancel={cancel}
        onChange={(c) => setSession((s) => withConsensus(s, t, c))}
      />
    </Section>
  );

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

        <Section step={1} title="Upload the canvas">
          <UploadStep
            fileName={session.fileName}
            notes={session.notes}
            redactTerms={session.redactTerms}
            revealed={session.revealed}
            onRevealedChange={(revealed) => setSession((s) => ({ ...s, revealed }))}
            onLoad={(fileName, n) => setSession((s) => ({
              ...s, fileName, notes: n, revealed: false,
              persons: emptyPersons(), consensus: null, sim: { persons: emptyPersons(), consensus: null },
            }))}
            onNotesChange={(n) => setSession((s) => ({ ...s, notes: n }))}
            onRedactChange={(t) => setSession((s) => ({ ...s, redactTerms: t }))}
          />
        </Section>

        <div>
          <div role="tablist" aria-label="Game mode" className="flex gap-1 border-b border-slate-200 px-2">
            <TabButton id="qf" active={tab === "qf"} onSelect={setTab}>1 · Questions first</TabButton>
            <TabButton id="sim" active={tab === "sim"} onSelect={setTab}>2 · Run the entire simulation</TabButton>
          </div>

          {tab === "qf" && (
            <div role="tabpanel" id="panel-qf" aria-labelledby="tab-qf" className="space-y-6 pt-6">
              {status}
              <Section step={2} title="Detectives' questions"
                right={
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={questionCount === 0} onClick={() => downloadQuestions(qf)}>Download questions.R</Button>
                    {busy === "questions"
                      ? <Button variant="danger" onClick={cancel}>Cancel</Button>
                      : <Button variant="primary" disabled={busy !== null} onClick={() => askQuestions([1, 2, 3, 4])}>Ask all</Button>}
                  </div>
                }>
                <p className="mb-3 text-sm text-slate-600">
                  The detectives <strong>can't see the canvas</strong>. Each one asks a knowledge base built from it, through its own lens.
                  Edit the questions, download <code>questions.R</code>, and ask them in R.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {PERSONAS.map((persona) => (
                    <QuestionsPanel
                      key={persona.id}
                      persona={persona}
                      person={qf[persona.id - 1]}
                      busy={busy !== null}
                      onRun={() => askQuestions([persona.id])}
                      onCancel={cancel}
                      onQuestionsChange={(questions: QA[]) => updatePerson("qf", persona.id, { questions })}
                    />
                  ))}
                </div>
              </Section>

              <Section step={3} title="Import RAG answers">
                <AnswersStep
                  persons={qf}
                  onPersonsChange={(persons) => setSession((s) => ({ ...s, persons }))}
                  onQuestionsChange={(id, questions) => updatePerson("qf", id, { questions })}
                />
              </Section>

              <Section step={4} title="Four detectives"
                right={busy === "blind"
                  ? <Button variant="danger" onClick={cancel}>Cancel</Button>
                  : <Button variant="primary" disabled={busy !== null || answerCount === 0} onClick={() => runBlind([1, 2, 3, 4])}>Run all</Button>}>
                {answerCount === 0 ? (
                  <p className="text-sm text-slate-500">
                    The detectives guess once the knowledge base has answered. Import <code>answers.csv</code> in step 3 to unlock this step.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-slate-600">Each guess uses only the knowledge base&apos;s answers to that detective&apos;s questions.</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {PERSONAS.map((persona) => (
                        <DetectiveCard
                          key={persona.id}
                          persona={persona}
                          person={qf[persona.id - 1]}
                          notesSeen={[]}
                          busy={busy !== null}
                          onRun={() => runBlind([persona.id])}
                          onCancel={cancel}
                          onCardChange={(card) => updatePerson("qf", persona.id, { card, edited: true })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </Section>

              {consensusSection("qf", 5)}
            </div>
          )}

          {tab === "sim" && (
            <div role="tabpanel" id="panel-sim" aria-labelledby="tab-sim" className="space-y-6 pt-6">
              {status}
              <Section step={2} title="Four detectives"
                right={
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!sim.some((p) => p.questions.length)} onClick={() => downloadQuestions(sim)}>Download questions.R</Button>
                    {busy === "sim"
                      ? <Button variant="danger" onClick={cancel}>Cancel</Button>
                      : <Button variant="primary" disabled={busy !== null || notes.length === 0} onClick={() => runSim([1, 2, 3, 4])}>Run all</Button>}
                  </div>
                }>
                <p className="mb-3 text-sm text-slate-600">
                  The full simulation: each detective <strong>reads its notes from the canvas</strong>, guesses the product, and suggests follow-up
                  questions for the RAG.
                </p>
                {notes.length === 0 && <p className="mb-3 text-sm text-slate-500">Upload a CSV in step 1 first.</p>}
                <div className="grid gap-4 lg:grid-cols-2">
                  {PERSONAS.map((persona) => {
                    const person = sim[persona.id - 1];
                    return (
                      <DetectiveCard
                        key={persona.id}
                        persona={persona}
                        person={person}
                        notesSeen={seenBy(person)}
                        busy={busy !== null || notes.length === 0}
                        onRun={() => runSim([persona.id])}
                        onCancel={cancel}
                        onCardChange={(card) => updatePerson("sim", persona.id, { card, edited: true })}
                        onQuestionsChange={(questions) => updatePerson("sim", persona.id, { questions })}
                      />
                    );
                  })}
                </div>
              </Section>

              {consensusSection("sim", 3)}
            </div>
          )}
        </div>

        <Section step="💾" title="Save / load">
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
