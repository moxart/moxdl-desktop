// The protocol of `mox engine`, as documented on Engine in mox.py.

export type Status =
  | "waiting"
  | "held"
  | "connecting"
  | "downloading"
  | "verifying"
  | "done"
  | "error"
  | "paused"
  | "nospace"; // waiting for disk space; starts again by itself once there is room

export type Download = {
  id: number;
  url: string;
  name: string;
  status: Status;
  message: string;
  done: number;
  total: number | null;
  speed: number;
  eta: number | null;
  connections: number;
  kind: string;
  path: string | null;
  stream: boolean;
  ready: number | null;
  pieces: number[] | null; // 0 to 3: how much of each cell of the file is on disk
  expired: boolean;
  then: Then;
  learned: boolean; // its connection count came from what earlier downloads from its server taught
  media: boolean; // a video from a site such as YouTube, through yt-dlp
};

export type Quality = "best" | "2160" | "1440" | "1080" | "720" | "480" | "360" | "audio";

/** A page that yt-dlp reads as a video: its title and the qualities it offers. */
export type MediaInfo = {
  title: string | null;
  duration: number | null;
  qualities: { quality: Quality; height: number | null; size: number | null; join: boolean }[];
};

/** What mox has for video sites. */
export type Tools = {
  ytdlp: { version: string | null; own: boolean; stale: boolean };
  js: string | null; // deno, node or bun
  ffmpeg: boolean;
  ffmpeg_own: boolean;
  can_install_ffmpeg: boolean;
};

/** What to do with a file once done, in this order: move it, open it, run a command on it. */
export type Then = { open?: boolean; move?: string; run?: string };

export type EngineState = {
  version: string;
  downloads: Download[];
  speed: number;
  focus: number | null;
  jobs: number;
  limit: number | null;
  free: number | null; // bytes free where downloads go
  window: Window | null; // download only between these times
  quota: number | null; // bytes a day
  today: number; // bytes received today
  gate: "schedule" | "quota" | null; // why nothing runs now
  slow: (Window & { limit: number }) | null; // a lower limit between those times
  rate: number | null; // the limit in force now
  lowered: "slow" | "polite" | null; // why rate is below limit
  offline: number | null; // seconds since the internet went down
  forecast: number | null; // seconds until the queue is done, by the hours' usual speeds
};

/** What mox learned: the internet's usual speed at each hour, and the servers it knows. */
export type Learned = {
  hours: [number, number][]; // 24 of [samples, bytes a second]
  best: { from: string; until: string; factor: number } | null;
  servers: number;
  enabled: boolean;
};

export type Window = { from: string; until: string }; // "02:00", "07:00"

export type HistoryEntry = {
  time: string;
  name: string;
  path: string;
  size: number;
  kind: string;
  url: string;
};

export type History = {
  entries: HistoryEntry[];
  traffic: [number, number, number] | null; // today, 7 days, 30 days
  daily: [string, number][]; // [date, bytes] for each of the last 30 days, today last
  enabled: boolean;
};

export type Config = {
  path: string;
  settings: Record<string, string>;
  keys: Record<string, string>; // setting -> what it does
};

export type EngineEvent =
  | { type: "hello"; version: string; settings: Record<string, string>; jobs: number; limit: number | null }
  | ({ type: "state" } & EngineState)
  | { type: "added"; ids: number[] }
  | { type: "finished"; id: number; status: Status; name: string; message: string; path: string | null }
  | { type: "notice"; text: string }
  | { type: "clipboard"; urls: string[]; tool: string | null; files: boolean }
  | ({ type: "config" } & Config)
  | ({ type: "history" } & History)
  | { type: "known"; items: KnownFile[] }
  | ({ type: "checked" } & Check)
  | { type: "check_done"; count: number; free: number | null }
  | ({ type: "learned" } & Learned)
  | ({ type: "tools" } & Tools)
  | { type: "installing"; tool: string; done: number; total: number | null }
  | { type: "error"; text: string };

/** A file downloaded before and still on disk, left out of an add. */
export type KnownFile = { url: string; name: string; path: string; time: string | null; size: number | null };

/** What a server said about a link, asked before downloading. */
export type Check = {
  url: string;
  ok: boolean;
  size?: number | null;
  name?: string;
  ranges?: boolean;
  message?: string;
  expired?: boolean;
  media?: MediaInfo | null;
};

export type Command =
  | {
      cmd: "add";
      text?: string;
      urls?: string[];
      dir?: string;
      sort?: boolean;
      stream?: boolean;
      first?: boolean;
      then?: Then;
      skip_known?: boolean;
      headers?: Record<string, string>;
      media?: boolean;
      quality?: Quality;
    }
  | { cmd: "then"; id: number; then: Then }
  | { cmd: "check"; text?: string; urls?: string[]; dir?: string }
  | { cmd: "hold"; id: number; on: boolean }
  | { cmd: "hold_all"; on: boolean }
  | { cmd: "next"; id: number }
  | { cmd: "move"; id: number; to: number }
  | { cmd: "focus"; id: number | null }
  | { cmd: "stream"; id: number; on: boolean }
  | { cmd: "remove"; id: number }
  | { cmd: "retry"; id: number }
  | { cmd: "clear" }
  | { cmd: "open"; id: number }
  | { cmd: "reveal"; id: number }
  | {
      cmd: "set";
      jobs?: number;
      limit?: string | number | null;
      window?: Window | null;
      quota?: number | null;
      slow?: (Window & { limit: number }) | null;
    }
  | { cmd: "clipboard"; files?: boolean }
  | { cmd: "config" }
  | { cmd: "config_set"; key: string; value: string | null }
  | { cmd: "history"; limit?: number }
  | { cmd: "learned" }
  | { cmd: "tools" }
  | { cmd: "install"; tool: "yt-dlp" | "deno" | "ffmpeg" }
  | { cmd: "forget" }
  | { cmd: "quit" };
