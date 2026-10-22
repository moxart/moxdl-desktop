import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

import { useAppSetting } from "../lib/appSettings";

const IN_APP = "__TAURI_INTERNALS__" in window;
// A development build has no release to compare with, and its version is whatever the checkout says.
const LOOKS = IN_APP && import.meta.env.PROD;
const FIRST_LOOK_MS = 15_000; // after the start, not during it
const LOOK_EVERY_MS = 24 * 3600_000;

type Update = { version: string; notes: string | null };
export type UpdateStatus = "idle" | "checking" | "current" | "installing" | "failed";

/**
 * Newer versions of the app, from the latest release on GitHub. The check only reads a small
 * JSON file; the update downloads and installs when the user presses the button, and its
 * signature is checked against the key built into the app before anything runs.
 */
export const useUpdates = () => {
  const [autoCheck, setAutoCheck] = useAppSetting("autoUpdateCheck", true);
  const [version, setVersion] = useState("");
  const [available, setAvailable] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState<[number, number | null] | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (IN_APP) getVersion().then(setVersion, () => {});
  }, []);

  const check = useCallback(async (quiet: boolean) => {
    if (!IN_APP) return;
    if (!quiet) setStatus("checking");
    try {
      const update = await invoke<Update | null>("check_update");
      setAvailable(update);
      setStatus(update ? "idle" : "current");
    } catch (error) {
      // A quiet check that fails, offline say, says nothing: it tries again tomorrow.
      if (!quiet) {
        setProblem(String(error));
        setStatus("failed");
      } else setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!LOOKS || !autoCheck) return;
    const first = setTimeout(() => void check(true), FIRST_LOOK_MS);
    const daily = setInterval(() => void check(true), LOOK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(daily);
    };
  }, [autoCheck, check]);

  useEffect(() => {
    if (!IN_APP) return;
    const stop = listen<[number, number | null]>("update-progress", (e) => setProgress(e.payload));
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const install = useCallback(async () => {
    setStatus("installing");
    setProgress(null);
    try {
      await invoke("install_update"); // the app restarts as the new version and never returns here
    } catch (error) {
      setProblem(String(error));
      setStatus("failed");
    }
  }, []);

  return {
    version,
    available,
    status,
    progress,
    problem,
    autoCheck,
    setAutoCheck,
    check: () => check(false),
    install,
    dismiss: () => setAvailable(null),
  };
};

export type Updates = ReturnType<typeof useUpdates>;
