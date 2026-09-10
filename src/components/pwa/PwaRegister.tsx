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
  /**
   * Gate on engagement. Firing the sheet on load meant it sat on top of the
   * hero, the standings rows and the H2H matrix on every route. Waiting for a
   * real scroll keeps it out of the way until someone is actually browsing.
   */
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    function onScroll(): void {
      // Only once they're near the end of a page, so the sheet never lands on
      // top of content someone is still reading. Listener-only, no check on
      // mount: a page shorter than the viewport is already "at the end" at
      // load, and running the check there brought back the prompt-on-load
      // behavior this gate exists to prevent.
      const doc = document.documentElement;
      const reachedEnd =
        window.scrollY + window.innerHeight >= doc.scrollHeight - 200;
      if (reachedEnd) setEngaged(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  if (!prompt || dismissed || !engaged) return null;

  return (
    <div
      // Phone: full-width sheet sitting *above* the live banner, which itself
      // floats above the bottom tab bar, so the three layers stack instead of
      // covering each other on game day. Desktop: the original bottom-right card.
      className="fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-40 px-4 sm:inset-x-auto sm:right-4 sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 sm:px-0 sm:max-w-xs"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-label={`Install ${LEAGUE_NAME} app`}
    >
      <div className="rounded-lg border border-border bg-surface-elevated shadow-xl p-3 text-sm flex flex-col gap-2">
        <span className="text-foreground font-medium">Install {LEAGUE_NAME}</span>
        <span className="text-xs text-foreground-muted">
          Get one-tap access from your home screen.
        </span>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={install}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-md bg-accent text-background text-sm font-medium px-3"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border text-sm px-4 text-foreground-muted"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
