# BMC Detective

A classroom guessing game. Upload another group's Business Model Canvas (Miro CSV export). Four AI detectives who can't see the canvas ask questions of your R-based RAG, then use its answers to guess what the product is. A second tab runs the full simulation, where the detectives read the canvas directly. Edit anything, then combine the guesses into a prompt for **Google AI Studio → Build**.

Everything runs in the browser. The LLM calls go **straight from your browser to Ollama on your own laptop**. A Vercel server can't reach your laptop, so there's no backend.

## Quick start (local)

```bash
npm install
npm run dev          # http://localhost:5173
```

1. **Settings**: click **Test connection**. Or tick **Mock mode** to try everything without Ollama.
2. **Upload** a Miro CSV, or click a sample board. The canvas stays **hidden** so players can't peek. Click **Reveal** to check notes, fix blocks, or add redaction terms, and **Hide the canvas** to cover it again.

**Tab 1 · Questions first.** The detectives never see the canvas.

3. **Ask all**: each detective writes 3–5 questions for a knowledge base built from the canvas, through its own lens. Edit them, then **Download questions.R**.
4. **In R**: `source("questions.R")`, ask your RAG each question, and save `answers.csv` with columns `person,question,answer`. There's a `write.csv` example at the end of `questions.R`.
5. **Import answers.csv**: each answer appears under its question, and you can edit or paste answers by hand.
6. **Four detectives → Run all**: each guesses from the answers only, citing them as `[A1]`, `[A2]`.
7. **Synthesize**: copy the Google AI Studio prompt.

**Tab 2 · Run the entire simulation.** The detectives read their notes directly, guess, and suggest follow-up questions, which this tab can also export as `questions.R`. Then synthesize.

Your session autosaves in the browser. Use `session.json` to move it to another machine.

## Ollama setup

```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text   # optional; adds similarity-based retrieval
```

Ollama already allows `http://localhost` origins, so `npm run dev` works with no extra setup. For the **deployed** site you must allow its origin and then **restart Ollama**:

| OS | Command |
|---|---|
| macOS | `launchctl setenv OLLAMA_ORIGINS "https://<your-app>.vercel.app"` then `pkill -f Ollama; sleep 2; open -a Ollama` (repeat after a reboot) |
| Windows (PowerShell) | `setx OLLAMA_ORIGINS "https://<your-app>.vercel.app"` then restart Ollama |
| Linux | `OLLAMA_ORIGINS="https://<your-app>.vercel.app" ollama serve` |

Use `"*"` to allow every origin while testing. Use **Chrome**, and click **Allow** if it asks about local network access.

### Tunnel option
If the browser can't reach `localhost` (another device, or a strict network), expose Ollama with a tunnel and paste the URL into Settings → *Ollama base URL*:

```bash
ngrok http 11434 --host-header="localhost:11434"
# or
cloudflared tunnel --url http://localhost:11434 --http-host-header localhost:11434
```

## Deploy to Vercel

The app is a static Vite SPA (`vercel.json` adds the SPA rewrite).

```bash
npm i -g vercel
vercel          # framework: Vite, build: npm run build, output: dist
```

Mock mode works on the deployed URL with no Ollama at all.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | vitest (the R export test also `source()`s the file if `Rscript` is installed) |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | production build to `dist/` |
| `OLLAMA_LIVE=1 npx vitest run tests/live.ollama.test.ts` | runs the real model on both sample boards (~2 min) |

## Tuning
All prompts live in `src/lib/prompts.ts` and all JSON schemas in `src/lib/schema.ts`. Personas (lens blocks and retrieval queries) are in `src/lib/personas.ts`.
