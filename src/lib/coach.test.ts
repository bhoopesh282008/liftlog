import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coachContext, parseProposal, toApiMessages } from "./coach";
import type { FoodEntry } from "./types";

describe("parseProposal", () => {
  it("keeps valid items and drops broken ones", () => {
    const p = parseProposal({
      meal: "lunch",
      items: [
        { food_id: "curated:roti", name: "Roti", serving: "1 medium (40 g)", servings: 2, kcal: 120, protein: 3.5, carbs: 20, fat: 3 },
        { name: "Bad", serving: "x", servings: 1, kcal: -5, protein: 1, carbs: 1, fat: 1 },
        { name: "", serving: "x", servings: 1, kcal: 5, protein: 1, carbs: 1, fat: 1 },
        "nonsense",
      ],
    });
    expect(p?.meal).toBe("lunch");
    expect(p?.status).toBe("pending");
    expect(p?.items).toEqual([{ foodId: "curated:roti", name: "Roti", serving: "1 medium (40 g)", servings: 2, kcal: 120, protein: 3.5, carbs: 20, fat: 3 }]);
  });

  it("rejects unknown meals and empty lists", () => {
    expect(parseProposal({ meal: "brunch", items: [{ name: "Dal", serving: "1 katori", servings: 1, kcal: 150, protein: 9, carbs: 20, fat: 4 }] })?.meal).toBeNull();
    expect(parseProposal({ items: [] })).toBeNull();
    expect(parseProposal(null)).toBeNull();
  });
});

describe("toApiMessages", () => {
  it("starts with the person, merges repeats, and notes proposals", () => {
    const out = toApiMessages([
      { role: "assistant", text: "Hi" },
      { role: "user", text: "ate 2 roti" },
      { role: "user", text: "and dal" },
      { role: "assistant", text: "Here you go", proposal: { meal: "lunch", status: "logged", items: [{ foodId: null, name: "Roti", serving: "1", servings: 2, kcal: 1, protein: 1, carbs: 1, fat: 1 }] } },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(out[0].content).toBe("ate 2 roti\n\nand dal");
    expect(out[1].content).toContain("[Proposed: 2 × Roti; they logged it]");
  });
});

describe("coachContext", () => {
  it("summarises today's food against the target", () => {
    const entry: FoodEntry = { id: "e1", date: "2026-10-19", meal: "lunch", foodId: "curated:roti", name: "Roti", serving: "1 medium", servings: 2, kcal: 120, protein: 3.5, carbs: 20, fat: 3, loggedAt: 1, updatedAt: 1, deletedAt: null };
    const text = coachContext(
      {
        profile: null,
        targets: [{ id: "t", date: "2026-10-01", calories: 2800, protein: 150, carbs: 350, fat: 80, source: "initial", reason: "", updatedAt: 1, deletedAt: null }],
        entries: [entry],
        foods: [],
        workouts: [],
        sets: [],
        exercises: [],
        weights: [{ id: "w", date: "2026-10-18", kg: 70, updatedAt: 1, deletedAt: null }],
        days: [],
      },
      "2026-10-19",
      new Date(2026, 9, 19, 20, 5),
    );
    expect(text).toContain("Now: 2026-10-19 (Mon) 20:05");
    expect(text).toContain("Daily target: 2800 kcal, protein 150 g");
    expect(text).toContain("Food today (240 kcal, 7 g protein");
    expect(text).toContain("- lunch: 2 × Roti (1 medium): 240 kcal, 7 g P");
    expect(text).toContain("Weight (kg): 2026-10-18 70");
  });
});

describe("/api/assistant", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY;
    process.env.ASSISTANT_EMAILS = "Me@Example.com";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const fakeFetch = (email: string | null, reply?: unknown) =>
    vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
      if (url.endsWith("/auth/v1/user")) return email ? Response.json({ email, email_confirmed_at: "2026-01-01" }) : new Response("no", { status: 401 });
      return Response.json(reply);
    });
  const req = (method: string, body?: unknown) =>
    new Request("http://localhost/api/assistant", { method, headers: { Authorization: "Bearer tok", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  it("is enabled only for allowed emails", async () => {
    vi.stubGlobal("fetch", fakeFetch("me@example.com"));
    const { GET } = await import("../app/api/assistant/route");
    expect(await (await GET(req("GET"))).json()).toEqual({ enabled: true });
    vi.stubGlobal("fetch", fakeFetch("someone@else.com"));
    expect(await (await GET(req("GET"))).json()).toEqual({ enabled: false });
  });

  it("refuses chat from other accounts without calling the model", async () => {
    const f = fakeFetch("someone@else.com");
    vi.stubGlobal("fetch", f);
    const { POST } = await import("../app/api/assistant/route");
    const res = await POST(req("POST", { messages: [{ role: "user", text: "hi" }] }));
    expect(res.status).toBe(403);
    expect(f.mock.calls.some(([u]) => String(u).includes("/v1/messages"))).toBe(false);
  });

  it("returns the reply and a validated proposal", async () => {
    const f = fakeFetch("me@example.com", {
      content: [
        { type: "text", text: "Logged-ready." },
        { type: "tool_use", name: "propose_food_log", input: { items: [{ name: "Dal", serving: "1 katori", servings: 1, kcal: 150, protein: 9, carbs: 20, fat: 4 }] } },
      ],
    });
    vi.stubGlobal("fetch", f);
    const { POST } = await import("../app/api/assistant/route");
    const res = await POST(req("POST", { messages: [{ role: "user", text: "had dal" }], context: "Now: today" }));
    const body = await res.json();
    expect(body.text).toBe("Logged-ready.");
    expect(body.proposal.items[0].name).toBe("Dal");
    const sent = JSON.parse(f.mock.calls.find(([u]) => String(u).includes("/v1/messages"))![1]!.body as string);
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent.messages).toEqual([{ role: "user", content: "had dal" }]);
    expect(sent.system[1].text).toContain("Now: today");
  });

  it("uses Gemini when its key is set, and maps roles and tool calls", async () => {
    process.env.GEMINI_API_KEY = "gem-key";
    const f = fakeFetch("me@example.com", {
      candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Sure." }, { functionCall: { name: "propose_food_log", args: { meal: "dinner", items: [{ name: "Paneer", serving: "100 g", servings: 1, kcal: 265, protein: 18, carbs: 4, fat: 20 }] } } }] } }],
    });
    vi.stubGlobal("fetch", f);
    const { POST } = await import("../app/api/assistant/route");
    const res = await POST(req("POST", { messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello" }, { role: "user", text: "had paneer" }], context: "Now: today" }));
    const body = await res.json();
    expect(body.text).toBe("Sure.");
    expect(body.proposal.meal).toBe("dinner");
    const [url, init] = f.mock.calls.find(([u]) => String(u).includes("generativelanguage"))!;
    expect(url).toContain("/models/gemini-flash-latest:generateContent");
    const sent = JSON.parse(init!.body as string);
    expect(sent.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(sent.systemInstruction.parts[0].text).toContain("Now: today");
    expect(sent.tools[0].functionDeclarations[0].name).toBe("propose_food_log");
  });

  it("reports a used-up free quota clearly", async () => {
    process.env.GEMINI_API_KEY = "gem-key";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/auth/v1/user") ? Response.json({ email: "me@example.com", email_confirmed_at: "x" }) : new Response("quota", { status: 429 }))));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("../app/api/assistant/route");
    const res = await POST(req("POST", { messages: [{ role: "user", text: "hi" }] }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("free AI quota");
  });
});
