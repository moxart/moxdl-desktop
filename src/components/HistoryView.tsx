import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import type { Engine } from "../engine/useEngine";
import { humanSize } from "../lib/format";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-line bg-surface px-4 py-3">
    <div className="text-xs text-muted">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular">{value}</div>
  </div>
);

export const HistoryView = ({ engine }: { engine: Engine }) => {
  const { history, send } = engine;
  const [query, setQuery] = useState("");
  useEffect(() => send({ cmd: "history", limit: 500 }), [send]);

  if (!history) return <p className="p-6 text-muted">Loading…</p>;
  if (!history.enabled && !history.entries.length)
    return <p className="p-6 text-muted">No history is kept. Turn it on in Settings.</p>;

  const kinds = new Map<string, { count: number; size: number }>();
  for (const e of history.entries) {
    const k = kinds.get(e.kind) ?? { count: 0, size: 0 };
    kinds.set(e.kind, { count: k.count + 1, size: k.size + e.size });
  }
  const [today, week, month] = history.traffic ?? [0, 0, 0];

  return (
    <div className="space-y-6 p-6">
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Received today" value={humanSize(today)} />
        <Stat label="Last 7 days" value={humanSize(week)} />
        <Stat label="Last 30 days" value={humanSize(month)} />
      </section>

      <section className="flex flex-wrap gap-2">
        {[...kinds.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([kind, k]) => (
            <span key={kind} className="rounded-full bg-surface px-3 py-1 text-sm">
              <span className="capitalize">{kind}</span> <span className="text-muted tabular">{k.count} · {humanSize(k.size)}</span>
            </span>
          ))}
      </section>

      <section>
        <label className="mb-3 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the history"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </label>
        <table className="w-full text-sm">
          <tbody>
            {[...history.entries]
              .reverse()
              .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()))
              .map((e, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-2 pr-4 text-muted tabular whitespace-nowrap">{e.time.replace("T", " ").slice(0, 16)}</td>
                <td className="max-w-0 w-full truncate py-2 pr-4" title={e.path}>
                  {e.name}
                </td>
                <td className="py-2 pr-4 capitalize text-muted">{e.kind}</td>
                <td className="py-2 text-right text-muted tabular whitespace-nowrap">{humanSize(e.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
