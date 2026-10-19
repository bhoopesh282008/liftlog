"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui";
import { clearCoachChat, CoachChat, useCoachMessages } from "./coach-screen";

// A floating button on every screen that opens the coach in a sheet, so a
// question or a meal never needs a trip to another tab. The app shell shows
// it only for accounts the server allows.
export function CoachLauncher() {
  const [open, setOpen] = useState(false);
  const messages = useCoachMessages();
  return (
    <>
      <button
        className="glass-control fixed right-4 z-30 flex size-14 items-center justify-center text-accent"
        style={{ bottom: "calc(98px + var(--dock, 0px) + env(safe-area-inset-bottom))" }}
        onClick={() => setOpen(true)}
        aria-label="Ask the coach"
      >
        <Sparkles size={22} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coach">
        <div className="flex min-h-[60dvh] flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Knows your workouts, food and weight. AI can be wrong.</p>
            {!!messages?.length && (
              <button className="btn btn-ghost btn-icon -mr-2 shrink-0" onClick={() => void clearCoachChat()} aria-label="Clear chat">
                <Trash2 size={18} />
              </button>
            )}
          </div>
          <CoachChat inSheet />
        </div>
      </Sheet>
    </>
  );
}
