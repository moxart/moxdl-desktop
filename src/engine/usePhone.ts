import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import { useAppSetting } from "../lib/appSettings";

const IN_APP = "__TAURI_INTERNALS__" in window;
// Outside the app (npm run dev) a made-up address, so the QR code shows.
const DEMO_URLS = ["http://192.168.1.20:6690/#0123456789abcdef0123456789abcdef"];

type RemoteInfo = { urls: string[] };

/**
 * The page for phones on the home network (src-tauri/src/remote.rs): on or off as Settings left
 * it, from the app's start, and the addresses it can be opened at.
 */
export const usePhone = () => {
  const [on, setOn] = useAppSetting("phone", false);
  const [urls, setUrls] = useState<string[]>([]);
  const [problem, setProblem] = useState("");

  const apply = useCallback(async (wanted: boolean, newKey = false) => {
    setProblem("");
    if (!IN_APP) {
      setUrls(wanted ? DEMO_URLS : []);
      return;
    }
    try {
      const info = await invoke<RemoteInfo | null>("remote", { on: wanted, newKey });
      setUrls(info?.urls ?? []);
    } catch (error) {
      setProblem(String(error));
      setUrls([]);
    }
  }, []);

  useEffect(() => {
    if (on) void apply(true);
  }, [on, apply]);

  const change = (wanted: boolean) => {
    setOn(wanted);
    if (!wanted) void apply(false);
  };

  return { on, urls, problem, change, newKey: () => apply(true, true) };
};

export type Phone = ReturnType<typeof usePhone>;
