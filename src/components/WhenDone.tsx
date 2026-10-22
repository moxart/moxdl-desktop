import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Moon, Power, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import { num } from "../lib/format";

export type WhenDoneAction = "nothing" | "quit" | "sleep" | "shutdown";
type Countdown = { action: Exclude<WhenDoneAction, "nothing">; seconds: number };

const IN_APP = "__TAURI_INTERNALS__" in window;
// ?countdown=shutdown shows the dialog outside the app, for working on its look.
const DEMO = new URLSearchParams(location.search).get("countdown") as Countdown["action"] | null;

/**
 * Quit, sleep or shut down once everything has downloaded. The app's shell watches for the end,
 * so it works with the window closed; this keeps the choice and shows the countdown.
 */
export const useWhenDone = () => {
  const [action, setAction] = useState<WhenDoneAction>("nothing");
  const [countdown, setCountdown] = useState<Countdown | null>(DEMO ? { action: DEMO, seconds: 60 } : null);

  useEffect(() => {
    if (!IN_APP) return;
    const stop = listen<Countdown | null>("when-done", (e) => {
      setCountdown(e.payload);
      if (!e.payload) setAction("nothing"); // done or cancelled: it does not carry over
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const choose = useCallback((next: WhenDoneAction) => {
    setAction(next);
    if (IN_APP) invoke("set_when_done", { action: next }).catch(() => {});
  }, []);

  const cancel = useCallback(() => {
    setCountdown(null);
    setAction("nothing");
    if (IN_APP) invoke("cancel_when_done").catch(() => {});
  }, []);

  const now = useCallback(() => {
    if (IN_APP) invoke("when_done_now").catch(() => {});
  }, []);

  return { action, choose, countdown, cancel, now };
};

export type WhenDone = ReturnType<typeof useWhenDone>;

/** The minute before the computer sleeps or shuts down, with a way out. */
export const CountdownDialog = ({ countdown, onCancel, onNow }: { countdown: Countdown; onCancel: () => void; onNow: () => void }) => {
  const t = useT();
  const [left, setLeft] = useState(countdown.seconds);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setLeft(Math.max(0, countdown.seconds - Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const Icon = countdown.action === "sleep" ? Moon : countdown.action === "shutdown" ? Power : X;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/55 p-6">
      <div role="dialog" aria-live="polite" className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center shadow-2xl">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent/12 text-accent">
          <Icon className="size-6" />
        </div>
        <p className="mt-4 font-semibold">{t.countdown[countdown.action](num(left))}</p>
        <p className="mt-1 text-sm text-muted">{t.countdownAbout}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" autoFocus onClick={onCancel} className="rounded-control button-primary px-5 py-2 font-semibold">
            {t.cancel}
          </button>
          <button type="button" onClick={onNow} className="rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text">
            {t.now}
          </button>
        </div>
      </div>
    </div>
  );
};
