import { ChevronDown, Power } from "lucide-react";
import type { ReactNode } from "react";

import type { Engine } from "../engine/useEngine";
import { cn, humanSize, num, rate } from "../lib/format";
import { useT } from "../lib/i18n";
import { Select } from "./Select";
import { SpeedGraph } from "./SpeedGraph";
import type { WhenDone, WhenDoneAction } from "./WhenDone";

const LIMITS = [null, 500 * 1024, 1024 ** 2, 2 * 1024 ** 2, 5 * 1024 ** 2, 10 * 1024 ** 2];
const AFTER: WhenDoneAction[] = ["nothing", "quit", "sleep", "shutdown"];

/**
 * What happens once everything has downloaded: a power icon and the choice, quiet until one is
 * made, then in crimson, so a planned shutdown is never a surprise.
 */
const AfterAll = ({ whenDone }: { whenDone: WhenDone }) => {
  const t = useT();
  const armed = whenDone.action !== "nothing";
  return (
    <label
      title={t.whenDone}
      className={cn(
        "relative flex cursor-pointer items-center gap-1.5 rounded-control px-2 py-1 transition-colors",
        armed ? "bg-accent/12 text-accent-text" : "hover:text-text",
      )}
    >
      <Power className="size-3.5 shrink-0" />
      <span>{armed ? t.whenDoneOptions[whenDone.action] : t.whenDone}</span>
      <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      {/* The system's menu, opened by the whole label, its look hidden behind ours. */}
      <select
        value={whenDone.action}
        aria-label={t.whenDone}
        onChange={(e) => whenDone.choose(e.target.value as WhenDoneAction)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {AFTER.map((a) => (
          <option key={a} value={a} className="bg-raised text-text">
            {t.whenDoneOptions[a]}
          </option>
        ))}
      </select>
    </label>
  );
};

const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center gap-2">
    <span className="text-faint">{label}</span>
    {children}
  </label>
);

export const StatusBar = ({ engine, whenDone }: { engine: Engine; whenDone: WhenDone }) => {
  const t = useT();
  const { state, send } = engine;
  const downloads = state?.downloads ?? [];
  const done = downloads.filter((d) => d.status === "done").length;
  const failed = downloads.filter((d) => d.status === "error").length;
  const focus = downloads.find((d) => d.id === state?.focus);
  const unfinished = downloads.filter((d) => d.status !== "done" && d.status !== "error");
  const allHeld = unfinished.length > 0 && unfinished.every((d) => d.status === "held");
  const current = state?.limit ?? null;
  const limits = LIMITS.includes(current) ? LIMITS : [...LIMITS, current];

  return (
    <footer className="flex items-center gap-4 whitespace-nowrap border-t border-line bg-surface px-4 py-2 text-xs text-muted">
      <span className="tabular">
        {t.doneCount(done, downloads.length)}
        {failed ? t.failedCount(failed) : ""}
      </span>
      {state && <SpeedGraph speed={state.speed} />}
      {state && state.speed > 0 && <span className="tabular text-text">{rate(state.speed)}</span>}
      {focus && <span className="truncate text-accent">{t.only(focus.name)}</span>}
      {state?.gate === "schedule" && state.window && <span className="text-warn">{t.waitingFor(num(state.window.from))}</span>}
      {state?.gate === "quota" && <span className="text-warn">{t.quotaReached(humanSize(state.quota))}</span>}
      {state?.quota != null && state.gate !== "quota" && (
        <span className="tabular">{t.todayOf(humanSize(state.today), humanSize(state.quota))}</span>
      )}
      <span className="ms-auto" />
      {state?.free != null && (
        <span className="tabular" title={t.freeTitle}>
          {t.free(humanSize(state.free))}
        </span>
      )}
      {unfinished.length > 0 && (
        <button type="button" onClick={() => send({ cmd: "hold_all", on: !allHeld })} className="hover:text-text">
          {allHeld ? t.resumeAll : t.pauseAll}
        </button>
      )}
      {done + failed > 0 && (
        <button type="button" onClick={() => send({ cmd: "clear" })} className="hover:text-text">
          {t.clearFinished}
        </button>
      )}
      <AfterAll whenDone={whenDone} />
      <Labeled label={t.atOnce}>
        <Select
          className="w-16"
          value={String(state?.jobs ?? 3)}
          options={[1, 2, 3, 4, 5, 6, 8].map((n) => [num(n), String(n)])}
          onChange={(v) => send({ cmd: "set", jobs: Number(v) })}
        />
      </Labeled>
      <Labeled label={t.speed}>
        <Select
          className="w-32"
          value={String(current ?? "")}
          options={limits.map((v) => [v === null ? t.noLimit : rate(v, true), v === null ? "" : String(v)])}
          onChange={(v) => send({ cmd: "set", limit: v ? Number(v) : null })}
        />
      </Labeled>
    </footer>
  );
};
