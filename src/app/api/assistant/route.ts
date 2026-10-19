import { CURATED_FOODS } from "@/lib/data/indian-foods";
import { type ChatMessage, isChatMessage, LOG_FOOD_TOOL, MAX_CONTEXT, MAX_HISTORY, parseProposal, SYSTEM_PROMPT, toApiMessages } from "@/lib/coach";

// The AI coach. Only signed-in people whose email is on ASSISTANT_EMAILS may
// use it, since replies run on the owner's API key. It calls Google Gemini
// when GEMINI_API_KEY is set (free tier), otherwise Anthropic with
// ANTHROPIC_API_KEY. All of these are server-only environment variables, set
// in Vercel; none reaches the browser. The chat itself is not stored here.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PER_HOUR = 60;

// The built-in catalogue (curated foods only; never INDB), so the model can
// log exact values by id. Fixed text, so providers can cache it.
const CATALOGUE =
  "Food catalogue (id | name | serving | kcal | protein g | carbs g | fat g):\n" +
  CURATED_FOODS.map((f) => `${f.id} | ${f.name} | ${f.serving} | ${f.kcal} | ${f.protein} | ${f.carbs} | ${f.fat}`).join("\n");

type Provider = "gemini" | "anthropic";
const provider = (): Provider | null => (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null);

function allowList(): string[] {
  return (process.env.ASSISTANT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// The caller's verified email, from their Supabase session token.
async function callerEmail(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { email?: string; email_confirmed_at?: string | null };
    return user.email && user.email_confirmed_at ? user.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function allowed(req: Request) {
  if (!provider()) return null;
  const email = await callerEmail(req);
  return email && allowList().includes(email) ? email : null;
}

// Per server instance; enough to stop a runaway loop on one account.
const recent = new Map<string, number[]>();
function overLimit(email: string) {
  const now = Date.now();
  const list = (recent.get(email) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  recent.set(email, list);
  return list.length > PER_HOUR;
}

type Turn = { role: "user" | "assistant"; content: string };
type Reply = { text: string; toolInput: unknown } | { status: number };

async function callGemini(system: string, messages: Turn[]): Promise<Reply> {
  const model = process.env.ASSISTANT_MODEL || "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      tools: [{ functionDeclarations: [{ name: LOG_FOOD_TOOL.name, description: LOG_FOOD_TOOL.description, parameters: LOG_FOOD_TOOL.input_schema }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return logUpstream(res);
  const out = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name?: string; args?: unknown } }[] } }[] };
  const parts = out.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim(),
    toolInput: parts.find((p) => p.functionCall?.name === LOG_FOOD_TOOL.name)?.functionCall?.args,
  };
}

async function callAnthropic(system: string, context: string, messages: Turn[]): Promise<Reply> {
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ASSISTANT_MODEL || "claude-haiku-5-5",
      max_tokens: 1024,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      tools: [LOG_FOOD_TOOL],
      messages,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return logUpstream(res);
  const out = (await res.json()) as { content?: { type: string; text?: string; name?: string; input?: unknown }[] };
  const blocks = out.content ?? [];
  return {
    text: blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim(),
    toolInput: blocks.find((b) => b.type === "tool_use" && b.name === LOG_FOOD_TOOL.name)?.input,
  };
}

async function logUpstream(res: Response): Promise<Reply> {
  console.error("assistant: upstream", res.status, (await res.text()).slice(0, 300));
  return { status: res.status === 429 ? 429 : 502 };
}

export async function GET(req: Request) {
  return Response.json({ enabled: Boolean(await allowed(req)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const email = await allowed(req);
  if (!email) return Response.json({ error: "The coach isn't available on this account." }, { status: 403 });
  if (overLimit(email)) return Response.json({ error: "That's a lot of questions for one hour. Try again a bit later." }, { status: 429 });

  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const history = Array.isArray(body.messages) ? body.messages.filter(isChatMessage).slice(-MAX_HISTORY) : [];
  const messages = toApiMessages(history as ChatMessage[]);
  if (messages.at(-1)?.role !== "user") return Response.json({ error: "Bad request." }, { status: 400 });
  const context = `The person's data (from their device):\n${typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "none sent"}`;
  const system = `${SYSTEM_PROMPT}\n\n${CATALOGUE}`;

  let reply: Reply;
  try {
    reply = provider() === "gemini" ? await callGemini(`${system}\n\n${context}`, messages) : await callAnthropic(system, context, messages);
  } catch {
    return Response.json({ error: "The coach didn't answer in time. Try again." }, { status: 504 });
  }
  if ("status" in reply) {
    const busy = reply.status === 429;
    return Response.json({ error: busy ? "The free AI quota is used up for now. Try again later." : "The coach is unavailable right now." }, { status: reply.status });
  }
  const proposal = reply.toolInput ? parseProposal(reply.toolInput) : null;
  return Response.json({ text: reply.text || (proposal ? "Here's what I'd log. Check it, then tap Log." : "Sorry, I didn't get that."), proposal });
}
