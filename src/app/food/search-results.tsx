import { ChefHat, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { searchLocal, searchOnline } from "@/lib/food-search";
import type { Food } from "@/lib/types";
import { ResultList } from "./result-list";

type Online = { q: string; foods: Food[]; state: "idle" | "loading" | "done" | "error" };

// Packaged foods come from Open Food Facts, searched after a short pause.
// Owned by the screen (not the results) so a query typed again reuses the
// last answer while the next search runs.
export function useOnlineSearch(query: string) {
  const [online, setOnline] = useState<Online>({ q: "", foods: [], state: "idle" });
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setOnline({ q, foods: [], state: "loading" });
      try {
        setOnline({ q, foods: await searchOnline(q, ctrl.signal), state: "done" });
      } catch {
        if (!ctrl.signal.aborted) setOnline({ q, foods: [], state: "error" });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);
  return online;
}

export function SearchResults({
  query,
  online,
  foods,
  useCounts,
  onPick,
  onCreate,
  onRecipe,
}: {
  query: string;
  online: Online;
  foods: Food[];
  useCounts: Map<string, number>;
  onPick: (f: Food) => void;
  onCreate: (name: string) => void;
  onRecipe: () => void;
}) {
  const q = query.trim();
  const local = useMemo(() => (q ? searchLocal(query, foods, useCounts) : []), [q, query, foods, useCounts]);
  return (
    <div className="animate-fade">
      <ResultList foods={local} onPick={onPick} />
      {q.length >= 3 && (
        <section className="mt-4">
          <h2 className="label mb-1 px-1">Packaged foods</h2>
          {online.q === q && online.state === "done" ? (
            online.foods.length ? (
              <ResultList foods={online.foods} onPick={onPick} />
            ) : (
              <p className="px-1 py-3 text-sm text-muted">No packaged matches.</p>
            )
          ) : online.state === "error" && online.q === q ? (
            <p className="px-1 py-3 text-sm text-muted">Packaged search needs a connection.</p>
          ) : (
            <p className="px-1 py-3 text-sm text-muted">Searching…</p>
          )}
        </section>
      )}
      <button className="btn mt-4 w-full" onClick={() => onCreate(q)}>
        <Plus size={18} /> Create “{q}”
      </button>
      <button className="btn btn-ghost mt-1 w-full" onClick={onRecipe}>
        <ChefHat size={18} /> Build a recipe instead
      </button>
    </div>
  );
}
