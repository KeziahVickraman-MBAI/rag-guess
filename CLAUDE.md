# BMC Detective

A classroom guessing game. A group uploads another group's Business Model Canvas (exported from Miro as CSV). Four AI detectives (Person 1–4) running on a **local Ollama model** each guess what the product/service is, show how they inferred it, and propose follow-up questions to ask a RAG system later (that RAG runs in R, outside this app). All generated content is editable. Finally, the app combines the four edited guesses into a prompt for building the guessed app in **Google AI Studio (Build mode)**.

---

## 1. Architecture (read this first)

- **Static, client-side only.** Vite + React + TypeScript + Tailwind, deployed to Vercel as a static SPA.
- **No serverless functions, no backend.** Vercel's servers cannot reach Ollama on the user's laptop, so **all LLM calls go from the browser directly to Ollama** (default `http://localhost:11434`).
- The user must run Ollama with CORS allowed for the site's origin, e.g. `OLLAMA_ORIGINS="https://<app>.vercel.app"` (or `*` for testing). Chrome is the supported browser; it may show a local-network permission prompt that the user must allow.
- The Ollama base URL is configurable, so a tunnel URL (ngrok / cloudflared) also works.
- **Mock mode** returns deterministic fake responses so the full flow works on Vercel without Ollama.

### Models
- Chat: `llama3.2:3b` (default, configurable)
- Embeddings: `nomic-embed-text` (optional; app must work without it)

Because the chat model is **3B**, keep every prompt short, keep context small, run detectives **sequentially**, and use Ollama structured outputs (`format` with a JSON schema).

---

## 2. User flow

### Step 0 — Settings (persist in localStorage)
- Ollama base URL (default `http://localhost:11434`)
- Chat model (default `llama3.2:3b`), embedding model (default `nomic-embed-text`)
- Temperatures: detectives `0.7`, synthesizer `0.3`
- **Test connection** → `GET /api/tags`; list installed models; mark whether the chosen chat/embed models exist.
- On failure, show a help box: set `OLLAMA_ORIGINS` (macOS / Windows / Linux commands), use Chrome, allow the local-network prompt, `ollama pull llama3.2:3b`, `ollama pull nomic-embed-text`.
- Mock mode toggle.

### Step 1 — Upload & review notes
- Upload CSV (papaparse). Miro's CSV format varies; be defensive:
  - Auto-detect the text column (`Content` / `Text` / `Title` / first non-empty column).
  - Detect a tag or block column if present.
  - Support CSVs with no header and single-column CSVs.
  - Trim whitespace, drop empty rows, strip HTML tags if present.
- Normalize to `Note` (see types). IDs are `N01`, `N02`, …
- Block assignment priority: tag/column value matched to the enum → keyword heuristic → `unknown`.
- Editable table: block dropdown, editable text, include checkbox per note.
- Warn clearly if more than 30% of included notes are `unknown` (block context matters for inference).
- **Redact terms** field (comma-separated product names, URLs). Case-insensitive replace with `[REDACTED]`; show a preview before analysis.

### Step 2 — Four detectives
| Person | Name | Lens blocks |
|---|---|---|
| 1 | Customer Sleuth | customer_segments, customer_relationships, channels |
| 2 | Value Hunter | value_propositions, key_activities |
| 3 | Money Tracker | revenue_streams, cost_structure |
| 4 | Tech Analyst | key_partners, key_resources |

**Retrieval (lightweight RAG in the browser):**
- If the embedding model is available: embed all included notes once via `POST /api/embed`, cache in memory. Each person gets all notes in their lens blocks **plus** the top 3 other notes by cosine similarity to that persona's `retrievalQuery`.
- Otherwise: lens-block notes only.
- If a person's lens blocks are empty (e.g. many `unknown` notes), fall back to top 6 by similarity, or all notes if no embeddings.

**Generation:**
- `POST /api/chat`, `stream: true`, so reasoning text appears live in the card.
- Then a structured pass with `format: <DetectiveCard JSON schema>`, `stream: false`.
- On JSON parse failure: retry once with the short "strict" prompt; then fall back to an empty editable card with the raw text shown.
- **Grounding check:** any cited `note_id` not in that person's retrieved set gets a red "not retrieved" chip.

**UI:**
- Four cards. A Run button per person and **Run all** (sequential).
- Every field editable: text inputs/textareas, confidence slider, add/remove/reorder for evidence rows and questions.
- Collapsible "Notes this person saw" section.
- Regenerate per card, with a confirm dialog if the card has user edits.
- Cancel button for any running generation (AbortController).

### Step 3 — Consensus & AI Studio prompt
- **Synthesize** sends the four **edited** cards (not raw generations) to the model.
- Output: a consensus guess (with where the detectives agree and disagree) and an AI Studio Build prompt.
- The AI Studio prompt is assembled from a **fixed template** (Section 5.3): the model fills sections; the app stitches them, so a 3B model stays on track.
- Large editable textarea with Copy and Regenerate.

### Step 4 — Export / import
- `questions.R` (format in Section 6). Must be valid R that can be `source()`d.
- `session.json`: notes, redaction terms, settings, edited cards, consensus, AI Studio prompt.
- `transcript.md`: readable report of the whole session.
- Import `session.json` to restore.
- Autosave the full session to localStorage on every change (debounced).

---

## 3. Types

```ts
type Block =
  | "key_partners" | "key_activities" | "key_resources"
  | "value_propositions" | "customer_relationships" | "channels"
  | "customer_segments" | "cost_structure" | "revenue_streams" | "unknown";

interface Note { id: string; text: string; block: Block; included: boolean; }

interface EvidenceRow { note_ids: string[]; evidence: string; inference: string; }

interface DetectiveCard {
  guess: string;                 // "A ___ for ___ that helps them ___"
  target_user: string;
  problem_solved: string;
  domain_and_location: string;
  evidence_chain: EvidenceRow[];
  confidence: number;            // 0–100
  unknowns: string[];            // what the BMC can't tell us
  rag_followup_questions: string[]; // 3–5
}

interface PersonState {
  personId: 1 | 2 | 3 | 4;
  retrievedNoteIds: string[];
  rawText: string;
  card: DetectiveCard | null;
  edited: boolean;
  status: "idle" | "running" | "done" | "error";
  error?: string;
}

interface Consensus {
  consensus_guess: string;
  agreements: string[];
  disagreements: string[];
  aiStudioPrompt: string;
}
```

---

## 4. File structure

```
src/
  lib/
    ollama.ts      # tags(), chatStream(), chatJSON(), embed(); AbortController; typed errors
    csv.ts         # parse + normalize Miro CSV → Note[]
    blocks.ts      # block enum, tag matching, keyword heuristic
    redact.ts
    retrieve.ts    # cosine similarity, per-persona retrieval
    personas.ts    # 4 personas: name, lens, retrievalQuery
    prompts.ts     # ALL prompts live here (easy to tune)
    schema.ts      # JSON schemas for Ollama `format`
    grounding.ts   # flag cited ids not retrieved
    exportR.ts     # questions.R with safe escaping
    exportMd.ts
    mock.ts        # deterministic mock responses
    store.ts       # session state + localStorage autosave
  components/
    SettingsPanel.tsx  UploadStep.tsx  NotesTable.tsx
    DetectiveCard.tsx  ConsensusPanel.tsx  ExportPanel.tsx  HelpBox.tsx
public/samples/
  board_a_screening.csv  board_b_farm.csv  board_headerless.csv
tests/              # vitest
vercel.json         # SPA rewrite
README.md
```

---

## 5. Prompts (starting drafts — tune in `prompts.ts`)

### 5.1 Detective system prompt
```
You are {name}, one of four detectives guessing what product or service a startup is building.
You only see sticky notes from its Business Model Canvas. Your lens: {lens description}.
Rules:
- Use ONLY the notes provided. Cite note IDs like [N07].
- Never invent a product name. Never mention a real brand unless it appears in the notes.
- Reason as: Evidence [IDs] -> Inference -> Hypothesis.
- If the notes don't say something, list it under unknowns.
```

### 5.2 Detective user prompt
```
Notes you can see:
{N01 | customer_segments | text}
...
1. In 3-6 short lines, think out loud: what do these notes suggest?
2. Give your best one-line guess: "A ___ for ___ that helps them ___".
3. Write 3-5 follow-up questions to ask a knowledge base built from this canvas.
   Each must be specific and able to confirm or refute your guess.
   Bad: "What is the app?"  Good: "Which customer segment is listed as primary, and how big are they?"
```

Strict retry prompt (structured pass): "Return only JSON matching the schema. Use the notes above. Keep each string under 30 words."

### 5.3 Synthesis prompt + AI Studio template
Synthesizer receives the four edited cards as compact JSON and returns:
```json
{ "consensus_guess": "", "agreements": [], "disagreements": [],
  "sections": { "product_name": "", "pitch": "", "users_and_context": "",
    "platform": "", "core_screens": [], "features": [],
    "sample_data": "", "integrations": [], "visual_direction": "" } }
```
The app stitches `sections` into this template:
```
Build a working prototype web app.

Product: {product_name} (placeholder name)
One-line pitch: {pitch}
Target users and context of use: {users_and_context}
Primary platform: {platform}

Core screens:
1. {screen}: {purpose}
...

Key features (each maps to a value proposition):
- ...

Seed the UI with realistic sample data: {sample_data}
Mock these data sources / integrations (no real API keys): {integrations}
Tone and visual direction: {visual_direction}

Note: this prototype is based on an inferred guess from a Business Model Canvas, not an official spec.
```

---

## 6. `questions.R` format

```r
# BMC Detective — generated 2026-10-06T10:00:00Z from board_a.csv
rag_questions <- list(
  person_1 = c("Which customer segment is primary?", "..."),
  person_2 = c("..."),
  person_3 = c("..."),
  person_4 = c("...")
)
all_questions <- unlist(rag_questions, use.names = FALSE)
```
Escape backslashes and double quotes, replace newlines with spaces, and preserve UTF-8 (Tamil, Swahili, "↔"). Skip empty questions; use `character(0)` for a person with none.

---

## 7. Error handling
Distinct, human-readable errors for: Ollama unreachable, likely CORS block (fetch TypeError with no response), model not installed (offer the `ollama pull` command), timeout (configurable, default 120s), invalid JSON after retry, empty CSV.

## 8. Testing (vitest)
- CSV normalization: header, headerless, single-column, tag column, quoted commas, HTML in cells.
- Block matching and the keyword heuristic.
- Redaction (case-insensitive, multi-word terms).
- Cosine retrieval ordering.
- R export: quotes, backslashes, newlines, Unicode; output parses as R (snapshot test).
- Grounding check.
- Mock mode end-to-end: upload sample → run all → synthesize → export.

## 9. Conventions
- TypeScript strict. No `any` in `lib/`.
- All prompts in `prompts.ts`, all schemas in `schema.ts`.
- No external network calls except to the configured Ollama URL.
- Keep dependencies minimal: react, papaparse, tailwind, vitest. No UI kit unless needed.
- Accessible: labels on all inputs, keyboard-usable cards, visible focus states.

## 10. Milestones
1. Scaffold, settings panel, `ollama.ts`, connection test, mock mode.
2. CSV upload, normalization, notes table, redaction.
3. Retrieval + detective generation + editable cards + grounding check.
4. Synthesis + AI Studio prompt.
5. Exports, import, autosave.
6. Tests, README, Vercel deploy config.

## 11. Definition of done
- Mock mode completes the full flow on the deployed Vercel URL.
- With Ollama running locally and `OLLAMA_ORIGINS` set, the deployed app produces four cards for each sample board.
- `questions.R` sources cleanly in R.
- Edits survive a page refresh.
- README covers local dev, deploy, `OLLAMA_ORIGINS` per OS, and the tunnel option.

---

## Appendix — sample boards (create as CSVs in `public/samples/`)

Format for the two main samples: columns `Content,Tags`, one tag per note (the block), all fields quoted. Also create `board_headerless.csv` (board B text only, no header, no tags) to test the fallback path.

### Board A — screening planner (block: notes)
- **key_partners:** Sports data APIs (football-data.org and TheSportsDB) as data providers · Beverage distributor for venue introductions · Venue associations and F&B business networks in Singapore
- **key_activities:** Fetch fixtures and standings daily; refresh badges weekly · Score matches and publish weekly plans · Generate posters and playbooks · Run monthly account reviews for Pro and Group
- **key_resources:** Match importance scoring rules RULE-01 to RULE-04 · Data from football-data.org and TheSportsDB · Venue history: past screenings with actual attendance · Poster templates and brand design system
- **value_propositions:** Know by Monday which matches will fill seats this week · Cut overstaffing on quiet nights; avoid running out of stock on big nights · Save about 3 hours a week of fixture checking and poster making · All kickoff times already in Singapore time
- **customer_relationships:** Self-service onboarding for the Starter plan · Named account manager and monthly review call for Pro and Group · In-app assistant that answers questions from this knowledge base
- **channels:** Web dashboard (desktop) for owners and managers; mobile view for floor staff · Weekly email and WhatsApp-style summary every Monday at 10am SGT · Direct sales visits to venues · Partnership with a beverage distributor
- **customer_segments:** Primary: independent sports bars and pubs in Singapore with 40–150 seats (Clarke Quay, Boat Quay, Holland Village, Robertson Quay) · Secondary: 24-hour cafes and prata shops that screen late matches (Tampines, Jurong, Bedok) · Tertiary: small groups of 2 to 5 outlets under one owner
- **cost_structure:** Hosting on Vercel: SGD 0–30 monthly · Gemini API usage: SGD 20–60 monthly · Sports data APIs (free tiers): SGD 0 · Account manager (part-time): SGD 1,800 monthly · Sales and marketing: SGD 600 monthly · Break-even is about 30 Pro-plan venues
- **revenue_streams:** Monthly subscriptions: Starter SGD 39, Pro SGD 89, Group SGD 249 · One-off setup fee of SGD 99 for Group plans · Optional sponsored poster slots for beverage brands (planned, not live)

### Board B — farm advisory (block: notes)
- **key_partners:** ISRIC SoilGrids & iSDAsoil providers · Digital Earth Africa & AWS Earth Search STAC · Open-Meteo weather service · India Meteorological Department (IMD) · Agmarknet data.gov.in · Africa's Talking SMS gateway
- **key_activities:** Real-time Sentinel-2 satellite imagery processing · Soil pH & nutrient mapping (250m resolution) · 7-day weather forecast integration · Deterministic agronomic rule execution · Multilingual advisories (Tamil/English/Swahili)
- **key_resources:** Knowledge graph ontology (GraphRAG schema) · Deterministic threshold rule engine · 30-day soil/weather cache system · Gemini LLM with grounding guardrails · STAC API & geospatial processing stack
- **value_propositions:** Daily irrigation, spray, sow decisions in <60 words · IMD-compliant cyclone & monsoon alerts · Mandi price guidance (sell/hold verdicts) · Dual view: mobile parent + web coordinator · Offline-resilient with snapshot caching
- **customer_relationships:** Daily automated advisories (SMS/WhatsApp) · Voice narration (Tamil ta-IN / English) · Real-time updates during monsoon season · Family coordination (Chennai ↔ Singapore)
- **channels:** SMS via Africa's Talking (Kenya) · WhatsApp one-click export (India) · Web dashboard (desktop coordinators) · Mobile-optimized parent view (large text)
- **customer_segments:** Smallholder families (Tamil Nadu & Kenya) · Multi-generational farms (1–5 acres) · Remote farm coordinators abroad · Extension officers & agronomists
- **cost_structure:** API usage: SoilGrids, Open-Meteo, STAC, Agmarknet · SMS gateway costs (Africa's Talking) · Gemini LLM inference quota · Cloud hosting & 30-day cache storage · Multilingual voice synthesis licensing
- **revenue_streams:** Freemium: free basics, premium depth analysis · Extension service subscriptions (district-level) · B2B licensing to agri-input companies · API access for third-party agtech platforms · Data partnerships with agri research institutes
