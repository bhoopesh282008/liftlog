"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(message: string, action?: Toast["action"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, action?: Toast["action"]) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, action });
    timer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
        style={{ bottom: "calc(80px + var(--dock, 0px) + env(safe-area-inset-bottom))" }}
      >
        {toast && (
          <div
            key={toast.id}
            className="animate-enter pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-text py-2 pr-2 pl-4 text-sm text-bg shadow-lg"
          >
            <span className="py-1.5">{toast.message}</span>
            {toast.action && (
              <button
                className="min-h-9 rounded-xl px-3 font-semibold text-accent"
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
