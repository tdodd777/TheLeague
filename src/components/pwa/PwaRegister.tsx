"use client";

import { useEffect, useState } from "react";

import { LEAGUE_NAME } from "@/config/site";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "league:pwa:install-dismissed";

export function PwaRegister() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev chunks aren't hash-stable; cached SW pins stale chunks and
      // breaks RSC client-module resolution ("originalFactory undefined").
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if (typeof window !== "undefined" && window.caches) {
        window.caches.keys().then((keys) => keys.forEach((k) => window.caches.delete(k)));
      }
    } else {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // silent — best-effort
      });
    }

    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    function onPrompt(e: Event): void {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
    setPrompt(null);
  }

  async function install(): Promise<void> {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    dismiss();
  }

  if (!prompt || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 max-w-xs rounded-lg border border-border bg-surface-elevated shadow-xl p-3 text-sm flex flex-col gap-2"
      role="dialog"
      aria-label={`Install ${LEAGUE_NAME} app`}
    >
      <span className="text-foreground font-medium">Install {LEAGUE_NAME}</span>
      <span className="text-xs text-foreground-muted">
        Get one-tap access from your home screen.
      </span>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={install}
          className="flex-1 rounded-md bg-accent text-background text-xs font-medium px-3 py-1.5"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-border text-xs px-3 py-1.5 text-foreground-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
