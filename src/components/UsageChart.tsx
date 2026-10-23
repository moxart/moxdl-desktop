import { useState } from "react";

import { cn, humanSize } from "../lib/format";
import { currentLang, useT } from "../lib/i18n";

type UsageChartProps = {
  daily: [string, number][]; // [date, bytes], oldest first, today last
  today: number | null; // today as the engine counts it now, unrecorded traffic included
  quota: number | null; // bytes a day, drawn as a line
};

const HEIGHT = 96;

const dayName = (date: string) =>
  new Intl.DateTimeFormat(currentLang() === "fa" ? "fa-IR" : undefined, { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );

/**
 * What came in each day of the last 30, as bars: to see how much of a data plan went, and when.
 * Today's bar is the brand's crimson; a dashed line marks the daily quota when there is one.
 */
export const UsageChart = ({ daily, today, quota }: UsageChartProps) => {
  const t = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  if (!daily.length) return null;
  const days = daily.map(([date, bytes], i) => [date, i === daily.length - 1 && today != null ? Math.max(bytes, today) : bytes] as const);
  const top = Math.max(...days.map(([, bytes]) => bytes), quota ?? 0, 1);
  const shown = hovered ?? days.length - 1;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4 text-sm">
        <span className="font-semibold">{t.usageTitle}</span>
        <span className="tabular text-muted">{t.usageDay(dayName(days[shown][0]), humanSize(days[shown][1]))}</span>
      </div>
      <div className="relative" style={{ height: HEIGHT }} onMouseLeave={() => setHovered(null)}>
        {quota != null && (
          <div
            className="absolute inset-x-0 border-t border-dashed border-warn/70"
            style={{ bottom: (quota / top) * HEIGHT }}
            title={`${t.usageQuota}: ${humanSize(quota)}`}
          />
        )}
        {/* Oldest at the start: on the left, or on the right in Persian, as text runs. */}
        <div className="flex h-full items-end gap-[3px]">
          {days.map(([date, bytes], i) => (
            <div
              key={date}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHovered(i)}
              title={t.usageDay(dayName(date), humanSize(bytes))}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  i === days.length - 1 ? "bg-accent" : hovered === i ? "bg-piece-2" : "bg-piece-1",
                )}
                style={{ height: Math.max(bytes > 0 ? 2 : 0, (bytes / top) * HEIGHT) }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
