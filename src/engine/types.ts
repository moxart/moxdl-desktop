// The protocol of `mox engine`, as documented on Engine in mox.py.

export type Status =
  | "waiting"
  | "held"
  | "connecting"
  | "downloading"
  | "verifying"
  | "done"
  | "error"
  | "paused";

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
};

export type EngineState = {
  version: string;
  downloads: Download[];
  speed: number;
  focus: number | null;
  jobs: number;
  limit: number | null;
  free: number | null; // bytes free where downloads go
};

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
  | { type: "error"; text: string };

export type Command =
  | { cmd: "add"; text?: string; urls?: string[]; dir?: string; sort?: boolean; stream?: boolean }
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
  | { cmd: "set"; jobs?: number; limit?: string | number | null }
  | { cmd: "clipboard"; files?: boolean }
  | { cmd: "config" }
  | { cmd: "config_set"; key: string; value: string | null }
  | { cmd: "history"; limit?: number }
  | { cmd: "quit" };
