import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSetting, useAppValue } from "../lib/appSettings";
import type { Quality } from "./types";

const IN_APP = "__TAURI_INTERNALS__" in window;

export type PoliteSetting = { on: boolean; limit: number }; // bytes a second while someone is there

/**
 * What the app does with the system around it, as Settings has it: the polite mode (slower while
 * someone uses the computer), the Ctrl+Shift+M key, and the floating drop target. Each is set in
 * the app's shell (src-tauri) from the start, not only once Settings is open.
 */
export const useSystem = () => {
  const [polite, setPolite] = useAppValue<PoliteSetting>("polite", { on: false, limit: 512 * 1024 });
  const [politeKnown, setPoliteKnown] = useState(true); // whether the system says when someone is there
  const [hotkey, setHotkey] = useAppSetting("hotkey", false);
  const [hotkeyProblem, setHotkeyProblem] = useState("");
  const [dropzone, setDropzone] = useAppSetting("dropzone", false);
  // Downloads the browser extension hands over start at once, or wait in the add dialog.
  const [browserStart, setBrowserStart] = useAppSetting("browserStart", true);
  // The highest video quality to take, here and for videos the browser sends.
  const [videoQuality, setVideoQuality] = useAppValue<Quality>("videoQuality", "1080");

  useEffect(() => {
    if (IN_APP) invoke("set_video_quality", { quality: videoQuality }).catch(() => {});
  }, [videoQuality]);

  useEffect(() => {
    if (IN_APP) invoke("set_browser_start", { on: browserStart }).catch(() => {});
  }, [browserStart]);

  useEffect(() => {
    if (!IN_APP) return;
    invoke<boolean>("set_polite", { limit: polite.on ? polite.limit : null }).then(setPoliteKnown, () => {});
  }, [polite]);

  // One switch for it, from the coffee cup in the status bar or the tray menu; the limit stays as set.
  const latest = useRef(polite);
  latest.current = polite;
  const togglePolite = useCallback(() => setPolite({ ...latest.current, on: !latest.current.on }), [setPolite]);
  useEffect(() => {
    if (!IN_APP) return;
    const stop = listen("polite-toggle", togglePolite);
    return () => void stop.then((unlisten) => unlisten());
  }, [togglePolite]);

  useEffect(() => {
    if (!IN_APP) return;
    setHotkeyProblem("");
    invoke("set_hotkey", { on: hotkey }).catch((error) => setHotkeyProblem(String(error)));
  }, [hotkey]);

  useEffect(() => {
    if (IN_APP) invoke("set_dropzone", { on: dropzone }).catch(() => {});
  }, [dropzone]);

  return { polite, setPolite, togglePolite, politeKnown, hotkey, setHotkey, hotkeyProblem, dropzone, setDropzone, browserStart, setBrowserStart, videoQuality, setVideoQuality };
};

export type System = ReturnType<typeof useSystem>;
