import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import type { Engine } from "../engine/useEngine";
import { humanSize, num } from "../lib/format";
import { useT } from "../lib/i18n";
import { HoursChart } from "./HoursChart";
import { UsageChart } from "./UsageChart";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-line bg-surface px-4 py-3">
    <div className="text-xs text-muted">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular">{value}</div>
  </div>
);

export const HistoryView = ({ engine }: { engine: Engine }) => {
  const t = useT();
  const { history, send } = engine;
  const [query, setQuery] = useState("");
  useEffect(() => {
    send({ cmd: "history", limit: 500 });
    send({ cmd: "learned" });
  }, [send]);

  if (!history) return <p className="p-6 text-muted">{t.loading}</p>;
  if (!history.enabled && !history.entries.length)
    return <p className="p-6 text-muted">{t.noHistory}</p>;

  const kinds = new Map<string, { count: number; size: number }>();
  for (const e of history.entries) {
    const k = kinds.get(e.kind) ?? { count: 0, size: 0 };
    kinds.set(e.kind, { count: k.count + 1, size: k.size + e.size });
  }
  const [today, week, month] = history.traffic ?? [0, 0, 0];

  return (
    <div className="space-y-6 p-6">
      <section className="grid grid-cols-3 gap-3">
        <Stat label={t.receivedToday} value={humanSize(today)} />
        <Stat label={t.last7} value={humanSize(week)} />
        <Stat label={t.last30} value={humanSize(month)} />
      </section>

      {history.enabled && history.daily && (
        <UsageChart daily={history.daily} today={engine.state?.today ?? null} quota={engine.state?.quota ?? null} />
      )}
      {engine.learned && <HoursChart learned={engine.learned} onForget={() => send({ cmd: "forget" })} />}

      <section className="flex flex-wrap gap-2">
        {[...kinds.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([kind, k]) => (
            <span key={kind} className="rounded-full bg-surface px-3 py-1 text-sm">
              <span className="capitalize">{t.kinds[kind] ?? kind}</span> <span className="text-muted tabular">{num(k.count)} · {humanSize(k.size)}</span>
            </span>
          ))}
      </section>

      <section>
        <label className="mb-3 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchHistory}
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
                <td className="py-2 pe-4 text-muted tabular whitespace-nowrap">{num(e.time.replace("T", " ").slice(0, 16))}</td>
                <td dir="auto" className="max-w-0 w-full truncate px-4 py-2 text-start" title={e.path}>
                  {e.name}
                </td>
                <td className="py-2 pe-4 capitalize text-muted">{t.kinds[e.kind] ?? e.kind}</td>
                <td className="py-2 text-end text-muted tabular whitespace-nowrap">{humanSize(e.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
