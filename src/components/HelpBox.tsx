export function HelpBox({ chatModel, embedModel }: { chatModel: string; embedModel: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";
  const code = "block rounded bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 whitespace-pre-wrap break-all";
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-800" role="note">
      <p className="font-semibold">Can't reach Ollama? Check these:</p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          <p>Allow this site to call Ollama (CORS), then <strong>quit and restart Ollama</strong>:</p>
          <p className="mt-1 text-xs font-semibold">macOS</p>
          <code className={code}>launchctl setenv OLLAMA_ORIGINS "{origin}"</code>
          <p className="mt-1 text-xs font-semibold">Windows (PowerShell)</p>
          <code className={code}>setx OLLAMA_ORIGINS "{origin}"</code>
          <p className="mt-1 text-xs font-semibold">Linux</p>
          <code className={code}>OLLAMA_ORIGINS="{origin}" ollama serve</code>
          <p className="mt-1 text-xs text-slate-600">Use <code>"*"</code> instead of the URL to allow any site while testing.</p>
        </li>
        <li>Use <strong>Chrome</strong>, and click <strong>Allow</strong> if it asks about accessing devices on your local network.</li>
        <li>
          Install the models:
          <code className={`${code} mt-1`}>{`ollama pull ${chatModel}\nollama pull ${embedModel}`}</code>
        </li>
        <li>Or turn on <strong>Mock mode</strong> to try the app without Ollama.</li>
      </ol>
    </div>
  );
}
