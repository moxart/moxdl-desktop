// A pretend engine for working on the look in a plain browser (npm run dev), with no Tauri and no
// mox: made-up downloads that move, so every style shows. It answers commands roughly like mox.

import type { Command, Download, EngineEvent } from "./types";

const MB = 1024 ** 2;
// For screenshots of the app: ?version=1.8 shows that rather than "demo", and ?shot leaves out
// the failed download that is otherwise there to style errors by.
const PARAMS = new URLSearchParams(location.search);
const VERSION = PARAMS.get("version") ?? "demo";
const SHOT = PARAMS.has("shot");
// ?offline and ?nospace show those states, for working on their look.
const OFFLINE = PARAMS.has("offline");
const NOSPACE = PARAMS.has("nospace");
const CELLS = 120;

const episode = (n: number, total: number): Download => ({
  id: n,
  url: `https://example.com/serial/Mr.Robot/s04/Mr.Robot.S04E${String(n).padStart(2, "0")}.1080p.WEB-DL.mkv`,
  name: `Mr.Robot.S04E${String(n).padStart(2, "0")}.1080p.WEB-DL.mkv`,
  status: "waiting",
  message: "",
  done: 0,
  total,
  speed: 0,
  eta: null,
  connections: 0,
  kind: "video",
  path: null,
  stream: false,
  ready: null,
  pieces: Array(CELLS).fill(0),
  expired: false,
  then: {},
  learned: n % 2 === 0,
});

export const startDemo = (emit: (event: EngineEvent) => void) => {
  let jobs = 3;
  let limit: number | null = null;
  let focus: number | null = null;
  let slow: { from: string; until: string; limit: number } | null = null;
  const offlineSince = Date.now();
  let next = 20;
  const downloads: Download[] = [1, 2, 3, 4, 5, 6].map((n) => episode(n, (900 + n * 110) * MB));
  Object.assign(downloads[0], { status: "done", done: downloads[0].total, path: "~/Downloads/mox/Series/Mr Robot/Season 04/" + downloads[0].name });
  if (!SHOT) Object.assign(downloads[5], { status: "error", message: "HTTP 403 Forbidden", expired: true });
  if (NOSPACE) Object.assign(downloads[4], { status: "nospace", message: "not enough disk space: needs 1.4 GB, 0.9 GB free" });
  // Some way along already, so the piece maps have something to show.
  ([[1, 0.62], [2, 0.35], [3, 0.15]] as const).forEach(([i, part]) => (downloads[i].done = downloads[i].total! * part));

  const tick = () => {
    const unfinished = downloads.filter((d) => !["done", "error", "held", "nospace"].includes(d.status));
    const running = focus !== null ? unfinished.filter((d) => d.id === focus) : unfinished.slice(0, jobs);
    for (const d of downloads) {
      if (!running.includes(d)) {
        if (["connecting", "downloading"].includes(d.status)) d.status = "waiting";
        d.speed = 0;
        continue;
      }
      if (d.status === "waiting") {
        d.status = "connecting";
        continue;
      }
      d.status = "downloading";
      d.connections = 16;
      if (OFFLINE) {
        Object.assign(d, { message: "no internet, waiting for it to come back", speed: 0, eta: null });
        continue;
      }
      d.speed = (focus !== null ? 11 : 3.5) * MB * (0.85 + Math.random() * 0.3);
      d.done = Math.min(d.total!, d.done + d.speed / 4);
      const filled = Math.floor((d.done / d.total!) * CELLS);
      d.pieces = d.pieces!.map((_, i) => {
        // In order when streaming; spread over the file otherwise, as mox's connections are.
        const rank = d.stream ? i : (i % 16) * (CELLS / 16) + Math.floor(i / 16);
        return rank < filled ? 3 : rank < filled + 2 ? 2 : rank < filled + 4 ? 1 : 0;
      });
      d.ready = d.stream ? d.done : null;
      d.eta = (d.total! - d.done) / d.speed;
      if (d.done >= d.total!) {
        Object.assign(d, { status: "done", speed: 0, eta: null, path: "~/Downloads/" + d.name });
        if (focus === d.id) focus = null;
        emit({ type: "finished", id: d.id, status: "done", name: d.name, message: "", path: d.path });
      }
    }
    emit({ type: "state", version: VERSION, downloads: structuredClone(downloads), speed: downloads.reduce((s, d) => s + d.speed, 0), focus, jobs, limit, free: 312 * 1024 * MB, window: null, quota: null, today: 3.2 * 1024 * MB, gate: null, slow, rate: slow ? slow.limit : limit, lowered: slow ? "slow" : null, offline: OFFLINE ? Math.round((Date.now() - offlineSince) / 1000) + 194 : null, forecast: null });
  };

  const find = (id: number) => downloads.findIndex((d) => d.id === id);
  const send = (c: Command) => {
    switch (c.cmd) {
      case "add": {
        const urls = (c.text ?? "").match(/https?:\/\/[^\s<>"'`]+/g) ?? c.urls ?? [];
        const added = urls.map((url) => {
          const d = { ...episode(next++, 1200 * MB), url, name: decodeURIComponent(url.split("/").pop()!.split("?")[0]), stream: !!c.stream };
          return d;
        });
        // first: ahead of everything unfinished, as mox does.
        const unfinished = downloads.findIndex((d) => !["done", "error"].includes(d.status));
        downloads.splice(c.first && unfinished >= 0 ? unfinished : downloads.length, 0, ...added);
        const ids = added.map((d) => d.id);
        emit({ type: "added", ids });
        break;
      }
      case "hold_all":
        for (const d of downloads) if (!["done", "error"].includes(d.status)) d.status = c.on ? "held" : "waiting";
        break;
      case "hold": {
        const d = downloads[find(c.id)];
        if (d) d.status = c.on ? "held" : "waiting";
        break;
      }
      case "next":
      case "move": {
        const from = find(c.id);
        const to = c.cmd === "next" ? downloads.findIndex((d) => d.status !== "done" && d.status !== "error") : c.to;
        downloads.splice(Math.max(0, to), 0, ...downloads.splice(from, 1));
        break;
      }
      case "focus":
        focus = c.id;
        break;
      case "stream": {
        const d = downloads[find(c.id)];
        if (d) d.stream = c.on;
        break;
      }
      case "remove":
        downloads.splice(find(c.id), 1);
        break;
      case "retry": {
        const d = downloads[find(c.id)];
        if (d) Object.assign(d, { status: "waiting", message: "", expired: false });
        break;
      }
      case "clear":
        downloads.splice(0, downloads.length, ...downloads.filter((d) => d.status !== "done" && d.status !== "error"));
        break;
      case "set":
        if (c.jobs) jobs = c.jobs;
        if ("limit" in c) limit = typeof c.limit === "number" ? c.limit : null;
        if ("slow" in c) slow = c.slow ?? null;
        break;
      case "open":
      case "reveal":
        emit({ type: "notice", text: "In the real app this opens the file or its folder." });
        break;
      case "check": {
        // Made-up answers: most links fine, one gone, so both looks show.
        const urls = (c.text ?? "").match(/https?:\/\/[^\s<>"'`]+/g) ?? c.urls ?? [];
        urls.forEach((url, i) =>
          setTimeout(() => {
            const name = decodeURIComponent(url.split("/").pop()!.split("?")[0]);
            emit(url.includes("gone") ? { type: "checked", url, ok: false, message: "HTTP 410 Gone", expired: true } : { type: "checked", url, ok: true, size: (700 + i * 230) * MB, name, ranges: true });
          }, 300 + i * 120),
        );
        setTimeout(() => emit({ type: "check_done", count: urls.length, free: 312 * 1024 * MB }), 400 + urls.length * 120);
        break;
      }
      case "learned":
      case "forget":
        // A made-up day: slow evenings, quick small hours, as a night plan sees it.
        emit({
          type: "learned",
          hours: Array.from({ length: 24 }, (_, h) => {
            const speed = h >= 1 && h < 7 ? 9.5 : h >= 18 && h < 24 ? 2.2 : 4.6;
            return [c.cmd === "forget" ? 0 : 12, c.cmd === "forget" ? 0 : Math.round((speed + Math.sin(h) * 0.6) * MB)];
          }),
          best: c.cmd === "forget" ? null : { from: "02:00", until: "06:00", factor: 2.1 },
          servers: c.cmd === "forget" ? 0 : 14,
          enabled: true,
        });
        break;
      case "clipboard":
        emit({ type: "clipboard", urls: [], tool: "wl-paste", files: !!c.files });
        break;
      case "config":
      case "config_set":
        emit({
          type: "config",
          path: "~/.config/mox/config",
          settings: { dir: "~/Downloads", sort: "on" },
          keys: { dir: "folder to save into", sort: "each kind of file in its own folder, series by show and season", sound: "a soft sound when done" },
        });
        break;
      case "history":
        emit({
          type: "history",
          enabled: true,
          traffic: [3.2 * 1024 * MB, 18.4 * 1024 * MB, 61 * 1024 * MB],
          daily: Array.from({ length: 30 }, (_, i) => {
            const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
            const bytes = i % 7 === 3 ? 0 : (0.6 + Math.abs(Math.sin(i * 1.7)) * 4.2) * 1024 * MB;
            return [day, Math.round(bytes)] as [string, number];
          }),
          entries: [1, 2, 3].map((n) => ({ time: `2026-10-2${n}T21:0${n}:00`, name: episode(n, 0).name, path: "", size: 1100 * MB, kind: "video", url: "" })),
        });
        break;
    }
    tick();
  };

  emit({ type: "hello", version: VERSION, settings: { dir: "~/Downloads", sort: "on" }, jobs, limit });
  // ?known: files left out of an add because they are on disk from before.
  if (PARAMS.has("known"))
    setTimeout(() =>
      emit({
        type: "known",
        items: [3, 4].map((n) => ({ url: `https://example.com/${episode(n, 0).name}`, name: episode(n, 0).name, path: "", time: "2026-10-19T23:40:00", size: (1000 + n * 120) * MB })),
      }),
    );
  const timer = setInterval(tick, 250);
  return { send, stop: () => clearInterval(timer) };
};
