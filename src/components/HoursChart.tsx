import { Brain } from "lucide-react";
import { useState } from "react";

import type { Learned } from "../engine/types";
import { cn, num, rate } from "../lib/format";
import { useT } from "../lib/i18n";

const HEIGHT = 80;

const inBest = (hour: number, best: Learned["best"]) => {
  if (!best) return false;
  const from = Number(best.from.slice(0, 2));
  const until = Number(best.until.slice(0, 2));
  return from < until ? hour >= from && hour < until : hour >= from || hour < until;
};

/**
 * What mox learned of the internet: its usual speed at each hour of the day, with the hours that
 * are usually fastest marked, and the hour now. Learning stays on this computer.
 */
export const HoursChart = ({ learned, onForget }: { learned: Learned; onForget: () => void }) => {
  const t = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  const now = new Date().getHours();
  const known = learned.hours.filter(([count]) => count > 0).length;
  const top = Math.max(...learned.hours.map(([count, speed]) => (count ? speed : 0)), 1);
  const shown = hovered ?? now;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Brain className="size-4 text-accent" />
        {t.hoursTitle}
      </div>
      <p className="mb-3 text-xs text-muted">{learned.enabled ? t.hoursAbout : t.learningOff}</p>
      {known === 0 ? (
        <p className="py-4 text-center text-sm text-faint">{t.hoursNotYet}</p>
      ) : (
        <>
          <div className="mb-2 flex justify-between gap-4 text-sm">
            <span className={learned.best ? "font-semibold text-accent-text" : "text-faint"}>
              {learned.best ? t.hoursBest(num(learned.best.from), num(learned.best.until), num(learned.best.factor)) : ""}
            </span>
            <span className="tabular text-muted">
              {num(`${String(shown).padStart(2, "0")}:00`)}
              {shown === now && hovered === null ? ` (${t.hoursNow})` : ""}
              {learned.hours[shown][0] ? ` · ${rate(learned.hours[shown][1], true)}` : ""}
            </span>
          </div>
          {/* Hours run as the clock reads, midnight first, in either language. */}
          <div dir="ltr" className="flex items-end gap-[3px]" style={{ height: HEIGHT }} onMouseLeave={() => setHovered(null)}>
            {learned.hours.map(([count, speed], hour) => (
              <div key={hour} className="flex h-full flex-1 items-end" onMouseEnter={() => setHovered(hour)}>
                <div
                  className={cn(
                    "w-full rounded-t-[3px] transition-colors",
                    !count ? "bg-line" : hour === now ? "bg-accent" : inBest(hour, learned.best) ? "bg-piece-2" : "bg-piece-1",
                    hovered === hour && count > 0 && "bg-piece-3",
                  )}
                  style={{ height: count ? Math.max(3, (speed / top) * HEIGHT) : 3 }}
                />
              </div>
            ))}
          </div>
          <div dir="ltr" className="mt-1 flex justify-between text-[10px] text-faint tabular">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h}>{num(String(h).padStart(2, "0"))}</span>
            ))}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted">
        <span>{learned.servers > 0 && t.knowsServers(learned.servers)}</span>
        {(known > 0 || learned.servers > 0) && (
          <button type="button" onClick={onForget} className="hover:text-text hover:underline">
            {t.forget}
          </button>
        )}
      </div>
    </section>
  );
};
