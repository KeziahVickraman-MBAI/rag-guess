# Kickoff prompt for Claude Code

Put `CLAUDE.md` in the root of an empty project folder, open Claude Code in that folder, and paste the prompt below.

---

```
Read CLAUDE.md fully. It is the spec for this project.

Before writing any code:
1. Summarize the architecture in 5 bullets, including why all Ollama calls happen in the browser and not on Vercel.
2. Show the file plan you'll create.
3. Show the final versions of the four detective prompts, the strict retry prompt, the synthesis prompt, and the JSON schemas, tuned for llama3.2:3b (short, concrete, small context).
4. List any assumptions or open questions about the Miro CSV format.

Then stop and wait for my approval.

After I approve, build milestone by milestone (Section 10). At the end of each milestone:
- run the tests and the type check,
- tell me what to try manually (with mock mode on, and with Ollama running),
- wait for my go-ahead before the next milestone.

Start with mock mode working end to end so I can demo without Ollama.
```

---

## Before testing with Ollama

```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

Allow the browser app to call Ollama:

- **macOS:** `launchctl setenv OLLAMA_ORIGINS "*"` then restart the Ollama app
- **Windows (PowerShell):** `setx OLLAMA_ORIGINS "*"` then restart Ollama
- **Linux:** `OLLAMA_ORIGINS="*" ollama serve`

Replace `*` with your Vercel URL (e.g. `https://bmc-detective.vercel.app`) once deployed. Use Chrome, and click "Allow" if it asks about local network access.
