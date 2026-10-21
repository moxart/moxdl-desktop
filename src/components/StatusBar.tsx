import type { ReactNode } from "react";

import type { Engine } from "../engine/useEngine";
import { humanSize } from "../lib/format";
import { Select } from "./Select";

const LIMITS: [string, number | null][] = [
  ["No limit", null],
  ["500 KB/s", 500 * 1024],
  ["1 MB/s", 1024 ** 2],
  ["2 MB/s", 2 * 1024 ** 2],
  ["5 MB/s", 5 * 1024 ** 2],
  ["10 MB/s", 10 * 1024 ** 2],
];

const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center gap-2">
    <span className="text-faint">{label}</span>
    {children}
  </label>
);

export const StatusBar = ({ engine }: { engine: Engine }) => {
  const { state, send } = engine;
  const downloads = state?.downloads ?? [];
  const done = downloads.filter((d) => d.status === "done").length;
  const failed = downloads.filter((d) => d.status === "error").length;
  const focus = downloads.find((d) => d.id === state?.focus);
  const unfinished = downloads.filter((d) => d.status !== "done" && d.status !== "error");
  const allHeld = unfinished.length > 0 && unfinished.every((d) => d.status === "held");
  const limits = LIMITS.some(([, v]) => v === (state?.limit ?? null))
    ? LIMITS
    : [...LIMITS, [humanSize(state?.limit ?? 0) + "/s", state?.limit ?? null] as [string, number | null]];

  return (
    <footer className="flex items-center gap-5 border-t border-line bg-surface px-4 py-2 text-xs text-muted">
      <span className="tabular">
        {done}/{downloads.length} done{failed ? ` · ${failed} failed` : ""}
      </span>
      {state && state.speed > 0 && <span className="tabular text-text">{humanSize(state.speed)}/s</span>}
      {focus && <span className="truncate text-accent">Only {focus.name}</span>}
      <span className="ml-auto" />
      {unfinished.length > 0 && (
        <button type="button" onClick={() => send({ cmd: "hold_all", on: !allHeld })} className="hover:text-text">
          {allHeld ? "Resume all" : "Pause all"}
        </button>
      )}
      {done + failed > 0 && (
        <button type="button" onClick={() => send({ cmd: "clear" })} className="hover:text-text">
          Clear finished
        </button>
      )}
      <Labeled label="At once">
        <Select
          className="w-16"
          value={String(state?.jobs ?? 3)}
          options={[1, 2, 3, 4, 5, 6, 8].map((n) => [String(n), String(n)])}
          onChange={(v) => send({ cmd: "set", jobs: Number(v) })}
        />
      </Labeled>
      <Labeled label="Speed">
        <Select
          className="w-32"
          value={String(state?.limit ?? "")}
          options={limits.map(([text, v]) => [text, v === null ? "" : String(v)])}
          onChange={(v) => send({ cmd: "set", limit: v ? Number(v) : null })}
        />
      </Labeled>
    </footer>
  );
};
