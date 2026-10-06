import type { ChatMessage } from "./types";

export type OllamaErrorKind =
  | "unreachable" | "cors" | "model_missing" | "timeout" | "aborted" | "http" | "invalid_json";

export class OllamaError extends Error {
  kind: OllamaErrorKind;
  model?: string;
  constructor(kind: OllamaErrorKind, message: string, model?: string) {
    super(message);
    this.name = "OllamaError";
    this.kind = kind;
    this.model = model;
  }
}

export interface CallOpts {
  baseUrl: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const trimUrl = (u: string): string => u.replace(/\/+$/, "");

/** Distinguish "Ollama isn't running" from "Ollama is running but CORS blocked us". */
async function diagnoseNetworkFailure(baseUrl: string): Promise<OllamaError> {
  try {
    // An opaque no-cors request succeeds if the server is up, even when CORS would block a normal fetch.
    await fetch(`${trimUrl(baseUrl)}/api/tags`, { mode: "no-cors" });
    return new OllamaError(
      "cors",
      `Ollama is running at ${baseUrl} but the browser blocked the request (CORS). Set OLLAMA_ORIGINS to allow this site and restart Ollama.`,
    );
  } catch {
    return new OllamaError(
      "unreachable",
      `Could not reach Ollama at ${baseUrl}. Is Ollama running? In Chrome, allow the local-network prompt if one appears.`,
    );
  }
}

async function request(path: string, init: RequestInit, opts: CallOpts, model?: string): Promise<Response> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${trimUrl(opts.baseUrl)}${path}`, { ...init, signal });
  } catch (e) {
    throw await toOllamaError(e, opts, timeout);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 && /not found/i.test(body) && model) {
      throw new OllamaError("model_missing", `Model "${model}" is not installed. Run: ollama pull ${model}`, model);
    }
    throw new OllamaError("http", `Ollama returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function toOllamaError(e: unknown, opts: CallOpts, timeout: AbortSignal): Promise<OllamaError> {
  if (e instanceof OllamaError) return e;
  if (timeout.aborted) {
    return new OllamaError("timeout", `Ollama took longer than ${Math.round(opts.timeoutMs / 1000)}s. Try again, or raise the timeout in Settings.`);
  }
  if (opts.signal?.aborted) return new OllamaError("aborted", "Cancelled.");
  if (e instanceof TypeError) return diagnoseNetworkFailure(opts.baseUrl);
  return new OllamaError("http", e instanceof Error ? e.message : String(e));
}

/** GET /api/tags → installed model names. */
export async function tags(opts: CallOpts): Promise<string[]> {
  const res = await request("/api/tags", { method: "GET" }, opts);
  const data: unknown = await res.json();
  const models = (data as { models?: { name?: unknown }[] }).models ?? [];
  return models.map((m) => (typeof m.name === "string" ? m.name : "")).filter(Boolean);
}

/** True if `model` is in the installed list ("llama3.2" matches "llama3.2:latest"). */
export function hasModel(installed: string[], model: string): boolean {
  const want = model.includes(":") ? model : `${model}:latest`;
  return installed.some((m) => m === model || m === want);
}

interface ChatParams extends CallOpts {
  model: string;
  messages: ChatMessage[];
  temperature: number;
}

/** POST /api/chat with stream: true. Calls onToken for each chunk; resolves with the full text. */
export async function chatStream(p: ChatParams, onToken: (t: string) => void): Promise<string> {
  const timeout = AbortSignal.timeout(p.timeoutMs);
  const res = await request(
    "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: p.model, messages: p.messages, stream: true, options: { temperature: p.temperature } }),
    },
    p,
    p.model,
  );
  if (!res.body) throw new OllamaError("http", "Ollama returned an empty stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  const handleLine = (line: string): void => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (msg.error) throw new OllamaError("http", msg.error);
    const t = msg.message?.content ?? "";
    if (t) { full += t; onToken(t); }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    handleLine(buf);
  } catch (e) {
    throw await toOllamaError(e, p, timeout);
  }
  return full;
}

/** POST /api/chat with a JSON schema in `format`, stream: false. Resolves with the parsed object. */
export async function chatJSON(p: ChatParams & { format: object }): Promise<unknown> {
  const res = await request(
    "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model, messages: p.messages, stream: false, format: p.format, options: { temperature: p.temperature },
      }),
    },
    p,
    p.model,
  );
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? "";
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new OllamaError("invalid_json", `The model did not return valid JSON: ${content.slice(0, 200)}`);
  }
}

/** POST /api/embed → one vector per input. */
export async function embed(p: CallOpts & { model: string; input: string[] }): Promise<number[][]> {
  const res = await request(
    "/api/embed",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: p.model, input: p.input }) },
    p,
    p.model,
  );
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length !== p.input.length) {
    throw new OllamaError("http", "Embedding response had the wrong shape.");
  }
  return data.embeddings;
}
