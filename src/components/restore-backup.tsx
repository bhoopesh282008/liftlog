"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { importBackup } from "@/lib/repo";

// Reads a LiftLog backup file chosen by the user and merges it in.
export function RestoreBackupButton({ className = "", onDone }: { className?: string; onDone?: (count: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button className={className} onClick={() => input.current?.click()}>
        <Upload size={18} className="text-muted" /> Restore from a backup
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const count = await importBackup(JSON.parse(await file.text()));
            setMsg(`Restored ${count} item${count === 1 ? "" : "s"}.`);
            onDone?.(count);
          } catch (err) {
            setMsg(err instanceof Error && err.message.includes("LiftLog") ? err.message : "That file couldn't be read as a LiftLog backup.");
          }
        }}
      />
      {msg && <p className="px-4 pb-3 text-sm text-muted">{msg}</p>}
    </>
  );
}
