import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { startDemo } from "./demo";
import type { Command, Config, EngineEvent, EngineState, History } from "./types";

export type Toast = { id: number; text: string; tone: "info" | "ok" | "error" };

export type Connection = "starting" | "running" | "stopped" | "missing";

const TOAST_MS = 4500;

// Outside Tauri (npm run dev in a browser) there is no mox to talk to, so a pretend one runs.
const IN_APP = "__TAURI_INTERNALS__" in window;

/** Everything the app knows about mox, kept up to date from the engine's events. */
export const useEngine = () => {
  const [connection, setConnection] = useState<Connection>("starting");
  const [problem, setProblem] = useState("");
  const [version, setVersion] = useState("");
  const [state, setState] = useState<EngineState | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Config | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);
  const demo = useRef<ReturnType<typeof startDemo> | null>(null);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextToast.current++;
    setToasts((all) => [...all, { id, text, tone }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const send = useCallback(
    (command: Command) => {
      if (demo.current) demo.current.send(command);
      else invoke("engine_send", { line: JSON.stringify(command) }).catch((error) => toast(String(error), "error"));
    },
    [toast],
  );

  const restart = useCallback(() => {
    setConnection("starting");
    invoke("restart_engine").catch((error) => {
      setConnection("missing");
      setProblem(String(error));
    });
  }, []);

  useEffect(() => {
    const handle = (event: EngineEvent) => {
      switch (event.type) {
        case "hello":
          setConnection("running");
          setVersion(event.version);
          setSettings(event.settings);
          break;
        case "state":
          // hello can go out before this page listens; a state means the engine is up all the same.
          setConnection("running");
          setVersion(event.version);
          setState(event);
          break;
        case "finished":
          if (event.status === "done") toast(`Downloaded ${event.name}`, "ok");
          else toast(`${event.name}: ${event.message}`, "error");
          break;
        case "notice":
          toast(event.text);
          break;
        case "error":
          toast(event.text, "error");
          break;
        case "config":
          setConfig(event);
          setSettings(event.settings);
          break;
        case "history":
          setHistory(event);
          break;
        case "added":
          break;
      }
    };
    if (!IN_APP) {
      demo.current = startDemo(handle);
      return () => demo.current?.stop();
    }
    const stops = [
      listen<string>("engine", (e) => {
        try {
          handle(JSON.parse(e.payload) as EngineEvent);
        } catch {
          // a line that is not JSON is not for us
        }
      }),
      listen("engine-exit", () => setConnection((c) => (c === "missing" ? c : "stopped"))),
      listen<string>("engine-missing", (e) => {
        setConnection("missing");
        setProblem(e.payload);
      }),
      listen<string>("engine-log", (e) => {
        if (e.payload.startsWith("!")) toast(e.payload.replace(/^!\s*/, ""), "error");
      }),
    ];
    return () => stops.forEach((stop) => stop.then((unlisten) => unlisten()));
  }, [toast]);

  return { connection, problem, version, state, settings, config, history, toasts, send, restart, toast };
};

export type Engine = ReturnType<typeof useEngine>;
