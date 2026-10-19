"use client";

import { AnimatePresence, motion } from "motion/react";
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
      {/* Always graphite, in both themes, so the lime action keeps its contrast. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
        style={{ bottom: "calc(96px + var(--dock, 0px) + env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0.15, visualDuration: 0.25 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-white/10 bg-[#1e2023] py-1.5 pr-1.5 pl-5 text-sm font-medium text-[#f2f3f1] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.5)]"
            >
              <span className="py-1.5">{toast.message}</span>
              {toast.action && (
                <button
                  className="min-h-10 rounded-full px-4 font-semibold text-[#c5f04a] transition-colors hover:bg-white/10"
                  onClick={() => {
                    toast.action!.run();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
