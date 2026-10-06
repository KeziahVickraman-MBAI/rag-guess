import { useId, useState } from "react";
import { hasModel, OllamaError, tags } from "../lib/ollama";
import { DEFAULT_SETTINGS } from "../lib/store";
import type { Settings } from "../lib/types";
import { HelpBox } from "./HelpBox";
import { Button, inputCls } from "./ui";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; models: string[] }
  | { kind: "error"; message: string };

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const ids = { url: useId(), chat: useId(), embed: useId(), dt: useId(), st: useId(), to: useId(), mock: useId() };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => onChange({ ...settings, [k]: v });

  async function runTest(): Promise<void> {
    setTest({ kind: "testing" });
    try {
      const models = await tags({ baseUrl: settings.baseUrl, timeoutMs: 10_000 });
      setTest({ kind: "ok", models });
    } catch (e) {
      setTest({ kind: "error", message: e instanceof OllamaError || e instanceof Error ? e.message : String(e) });
    }
  }

  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
  const modelStatus = (m: string) =>
    test.kind === "ok" ? (
      hasModel(test.models, m)
        ? <span className="text-xs text-green-700">✓ installed</span>
        : <span className="text-xs text-red-700">✗ not installed — <code>ollama pull {m}</code></span>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
        <input id={ids.mock} type="checkbox" className="h-5 w-5" checked={settings.mockMode} onChange={(e) => set("mockMode", e.target.checked)} />
        <label htmlFor={ids.mock} className="text-sm">
          <strong>Mock mode</strong> — fake, deterministic answers so you can try the full flow without Ollama.
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={ids.url} className={label}>Ollama base URL</label>
          <input id={ids.url} className={inputCls} value={settings.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder={DEFAULT_SETTINGS.baseUrl} />
          <p className="mt-1 text-xs text-slate-500">A tunnel URL (ngrok / cloudflared) works too.</p>
        </div>
        <div>
          <label htmlFor={ids.chat} className={label}>Chat model</label>
          <input id={ids.chat} className={inputCls} value={settings.chatModel} onChange={(e) => set("chatModel", e.target.value)} />
          {modelStatus(settings.chatModel)}
        </div>
        <div>
          <label htmlFor={ids.embed} className={label}>Embedding model (optional)</label>
          <input id={ids.embed} className={inputCls} value={settings.embedModel} onChange={(e) => set("embedModel", e.target.value)} />
          {modelStatus(settings.embedModel)}
        </div>
        <div>
          <label htmlFor={ids.dt} className={label}>Detective temperature: {settings.detectiveTemperature.toFixed(1)}</label>
          <input id={ids.dt} type="range" min={0} max={1.5} step={0.1} className="w-full" value={settings.detectiveTemperature}
            onChange={(e) => set("detectiveTemperature", Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={ids.st} className={label}>Synthesizer temperature: {settings.synthTemperature.toFixed(1)}</label>
          <input id={ids.st} type="range" min={0} max={1.5} step={0.1} className="w-full" value={settings.synthTemperature}
            onChange={(e) => set("synthTemperature", Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={ids.to} className={label}>Timeout (seconds)</label>
          <input id={ids.to} type="number" min={10} max={900} className={inputCls} value={settings.timeoutSec}
            onChange={(e) => set("timeoutSec", Math.max(10, Number(e.target.value) || DEFAULT_SETTINGS.timeoutSec))} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={runTest} disabled={test.kind === "testing"}>
          {test.kind === "testing" ? "Testing…" : "Test connection"}
        </Button>
        <Button variant="ghost" onClick={() => onChange({ ...DEFAULT_SETTINGS, mockMode: settings.mockMode })}>Reset to defaults</Button>
        <span role="status" className="text-sm">
          {test.kind === "ok" && <span className="text-green-700">Connected. {test.models.length} model(s) installed.</span>}
          {test.kind === "error" && <span className="text-red-700">{test.message}</span>}
        </span>
      </div>
      {test.kind === "ok" && test.models.length > 0 && (
        <p className="text-xs text-slate-600">Installed: {test.models.join(", ")}</p>
      )}
      {test.kind === "error" && <HelpBox chatModel={settings.chatModel} embedModel={settings.embedModel} />}
    </div>
  );
}
