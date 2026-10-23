import { ChevronDown, Coffee, Gauge, ListX, Power } from "lucide-react";
import type { ReactNode } from "react";

import type { Engine } from "../engine/useEngine";
import type { System } from "../engine/useSystem";
import { clockIn, cn, humanSize, humanTime, num, rate } from "../lib/format";
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

export const StatusBar = ({ engine, whenDone, system }: { engine: Engine; whenDone: WhenDone; system: System }) => {
  const t = useT();
  const { state, send } = engine;
  const downloads = state?.downloads ?? [];
  const done = downloads.filter((d) => d.status === "done").length;
  const failed = downloads.filter((d) => d.status === "error").length;
  const focus = downloads.find((d) => d.id === state?.focus);
  const unfinished = downloads.filter((d) => d.status !== "done" && d.status !== "error");
  const allHeld = unfinished.length > 0 && unfinished.every((d) => d.status === "held");
  // When the whole queue is done, at today's speed: what is left of every download that is not
  // paused, over the total speed. Unknown while a size is unknown or the schedule holds them.
  const going = unfinished.filter((d) => d.status !== "held");
  const left = going.every((d) => d.total) ? going.reduce((sum, d) => sum + (d.total ?? 0) - d.done, 0) : null;
  const allDone = state && !state.gate && state.speed > 0 && left ? left / state.speed : null;
  const current = state?.limit ?? null;
  const limits = LIMITS.includes(current) ? LIMITS : [...LIMITS, current];

  return (
    <footer className="flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line bg-surface px-4 py-2 text-xs text-muted">
      <span className="tabular">
        {t.doneCount(done, downloads.length)}
        {failed ? t.failedCount(failed) : ""}
      </span>
      {/* The graph gives way first when the window is narrow: the numbers matter more. */}
      {state && (
        <span className="hidden xl:contents">
          <SpeedGraph speed={state.speed} />
        </span>
      )}
      {state && state.speed > 0 && <span className="tabular text-text">{rate(state.speed)}</span>}
      {state?.lowered && state.rate != null && (
        // Slower than asked, by the slow hours or because someone is at the computer: why, on hover.
        <span className="inline-flex items-center gap-1 tabular text-warn" title={t.lowered[state.lowered](rate(state.rate))}>
          <Gauge className="size-3.5" />
          {rate(state.rate, true)}
        </span>
      )}
      {allDone != null && (
        <span className="tabular" title={t.allDoneTitle(humanTime(allDone))}>
          {t.allDoneAt(clockIn(allDone))}
        </span>
      )}
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
        <button
          type="button"
          onClick={() => send({ cmd: "clear" })}
          title={t.clearFinished}
          aria-label={t.clearFinished}
          className="grid size-7 shrink-0 place-items-center rounded-control hover:text-text"
        >
          <ListX className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={system.togglePolite}
        aria-pressed={system.polite.on}
        title={`${t.politeOn}: ${rate(system.polite.limit, true)}`}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-control transition-colors",
          system.polite.on ? "bg-accent/12 text-accent-text" : "hover:text-text",
        )}
      >
        <Coffee className="size-4" />
      </button>
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
