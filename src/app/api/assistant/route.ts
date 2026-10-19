import { CURATED_FOODS } from "@/lib/data/indian-foods";
import { type ChatMessage, isChatMessage, LOG_FOOD_TOOL, MAX_CONTEXT, MAX_HISTORY, parseProposal, SYSTEM_PROMPT, toApiMessages } from "@/lib/coach";

// The AI coach. Only signed-in people whose email is on ASSISTANT_EMAILS may
// use it, because every reply is billed to ANTHROPIC_API_KEY. Both are
// server-only environment variables, set in Vercel; neither reaches the
// browser. The chat itself is not stored here.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-5-5";
const API = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const PER_HOUR = 60;

// The built-in catalogue (curated foods only; never INDB), so the model can
// log exact values by id. Fixed text, so it is cached with the prompt.
const CATALOGUE =
  "Food catalogue (id | name | serving | kcal | protein g | carbs g | fat g):\n" +
  CURATED_FOODS.map((f) => `${f.id} | ${f.name} | ${f.serving} | ${f.kcal} | ${f.protein} | ${f.carbs} | ${f.fat}`).join("\n");

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
  if (!process.env.ANTHROPIC_API_KEY) return null;
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
  const context = typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "";

  let res: Response;
  try {
    res = await fetch(`${API}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [
          { type: "text", text: `${SYSTEM_PROMPT}\n\n${CATALOGUE}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `The person's data (from their device):\n${context || "none sent"}` },
        ],
        tools: [LOG_FOOD_TOOL],
        messages,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return Response.json({ error: "The coach didn't answer in time. Try again." }, { status: 504 });
  }
  if (!res.ok) {
    console.error("assistant: upstream", res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: "The coach is unavailable right now." }, { status: 502 });
  }

  const out = (await res.json()) as { content?: { type: string; text?: string; name?: string; input?: unknown }[] };
  const blocks = out.content ?? [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  const call = blocks.find((b) => b.type === "tool_use" && b.name === LOG_FOOD_TOOL.name);
  const proposal = call ? parseProposal(call.input) : null;
  return Response.json({ text: text || (proposal ? "Here's what I'd log. Check it, then tap Log." : "Sorry, I didn't get that."), proposal });
}
