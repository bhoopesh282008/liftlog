"use client";

import type { IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import { lookupBarcode } from "@/lib/food-search";
import type { Food } from "@/lib/types";

// iOS Safari has no built-in barcode detector, so decoding runs in JS on
// the camera feed.
interface ScanProps {
  onFound: (food: Food) => void;
  onMissing: (code: string) => void;
}

export function BarcodeScanner({ open, onClose, ...rest }: ScanProps & { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Scan barcode">
      <ScannerBody {...rest} />
    </Sheet>
  );
}

// Mounted only while the sheet is open, so the camera starts and stops with it.
function ScannerBody({ onFound, onMissing }: ScanProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking" | "error">("starting");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  const lookup = async (code: string) => {
    setStatus("looking");
    try {
      const food = await lookupBarcode(code);
      if (food) onFound(food);
      else onMissing(code);
    } catch {
      setStatus("error");
      setError("Couldn't reach the food database. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let stopped = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current!,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              controls?.stop();
              navigator.vibrate?.(60);
              void lookup(result.getText());
            }
          },
        );
        if (stopped) controls.stop();
        else setStatus("scanning");
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera access is off. Allow it in Settings, or type the barcode below."
            : "The camera couldn't start. Type the barcode below instead.",
        );
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
    // Start the camera once per open; lookup's identity changing must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <video ref={video} className="h-full w-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/70" />
        {status !== "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-6 text-center text-sm text-white">
            {status === "starting" ? "Starting camera…" : status === "looking" ? "Looking up product…" : error}
          </div>
        )}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim().length >= 6) void lookup(manual.trim());
        }}
      >
        <input className="input num" inputMode="numeric" placeholder="Or type the barcode number" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} />
        <button className="btn" type="submit">
          Find
        </button>
      </form>
    </>
  );
}
