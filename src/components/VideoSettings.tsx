import { Clapperboard } from "lucide-react";
import { useEffect } from "react";

import type { Quality } from "../engine/types";
import type { Engine } from "../engine/useEngine";
import { num } from "../lib/format";
import { useT } from "../lib/i18n";
import { Select } from "./Select";

export const QUALITIES: Quality[] = ["best", "2160", "1440", "1080", "720", "480", "360", "audio"];

type Tool = "yt-dlp" | "deno" | "ffmpeg";

/** One helper: what it is, how it stands, and a button to fetch or refresh it. */
const ToolRow = ({
  label,
  state,
  ok,
  action,
  busy,
  onInstall,
  note,
}: {
  label: string;
  state: string;
  ok: boolean;
  action: string | null;
  busy: string | null;
  onInstall: () => void;
  note?: string;
}) => (
  <div className="flex items-center justify-between gap-6 py-2.5">
    <span className="min-w-0">
      <span className="block text-sm">{label}</span>
      <span className={ok ? "block text-xs text-muted" : "block text-xs text-warn"}>{state}</span>
      {note && <span className="block text-xs text-faint">{note}</span>}
    </span>
    {busy ? (
      <span className="shrink-0 text-xs text-muted tabular">{busy}</span>
    ) : (
      action && (
        <button type="button" onClick={onInstall} className="shrink-0 rounded-control bg-raised px-3 py-1.5 text-sm hover:bg-hover">
          {action}
        </button>
      )
    )}
  </div>
);

/**
 * Settings → Video sites: yt-dlp, a JavaScript runtime and ffmpeg, each fetched by mox into its
 * own folder from the project's releases, and the quality to take.
 */
export const VideoSettings = ({
  engine,
  quality,
  onQuality,
}: {
  engine: Engine;
  quality: Quality;
  onQuality: (q: Quality) => void;
}) => {
  const t = useT();
  const { tools, installing, send } = engine;
  useEffect(() => send({ cmd: "tools" }), [send]);

  const install = (tool: Tool) => send({ cmd: "install", tool });
  const busy = (tool: Tool) =>
    installing?.tool === tool
      ? t.fetching(installing.total ? `${num(Math.floor((100 * installing.done) / installing.total))}%` : "")
      : null;
  const ytdlp = tools?.ytdlp;

  return (
    <div className="mb-8">
      <p className="mb-2 flex gap-2 text-xs text-muted">
        <Clapperboard className="mt-0.5 size-3.5 shrink-0 text-accent" />
        {t.videoAbout}
      </p>
      {tools && (
        <div className="divide-y divide-line">
          <ToolRow
            label={t.tools.ytdlp}
            ok={!!ytdlp?.version && !ytdlp.stale}
            state={
              !ytdlp?.version
                ? t.toolMissing
                : ytdlp.stale
                  ? t.toolOld(ytdlp.version)
                  : `${ytdlp.version} · ${ytdlp.own ? t.toolOwn : t.toolSystem}`
            }
            action={!ytdlp?.version ? t.install : t.update}
            busy={busy("yt-dlp")}
            onInstall={() => install("yt-dlp")}
          />
          <ToolRow
            label={t.tools.js}
            ok={!!tools.js}
            state={tools.js ?? t.toolMissing}
            action={tools.js ? null : t.install}
            busy={busy("deno")}
            onInstall={() => install("deno")}
          />
          <ToolRow
            label={t.tools.ffmpeg}
            ok={tools.ffmpeg}
            state={tools.ffmpeg ? (tools.ffmpeg_own ? t.toolOwn : t.toolSystem) : t.toolMissing}
            action={tools.ffmpeg || !tools.can_install_ffmpeg ? null : t.install}
            busy={busy("ffmpeg")}
            onInstall={() => install("ffmpeg")}
            note={tools.ffmpeg ? undefined : tools.can_install_ffmpeg ? t.withoutFfmpeg : t.ffmpegMac}
          />
          <div className="flex items-center justify-between gap-6 py-2.5">
            <span>
              <span className="block text-sm">{t.videoQuality}</span>
              <span className="block text-xs text-muted">{t.videoQualityAbout}</span>
            </span>
            <Select
              className="w-40"
              label={t.videoQuality}
              value={quality}
              options={QUALITIES.map((q) => [t.qualities[q], q])}
              onChange={(v) => onQuality(v as Quality)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
