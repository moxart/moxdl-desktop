import { useCallback, useState } from "react";

// Settings of the app itself, as opposed to mox's own (mox config, shown in Settings too).
// Kept in the webview's storage, which can be missing or blocked: then the defaults hold.

const PREFIX = "mox.";

const read = (key: string, fallback: boolean): boolean => {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value === null ? fallback : value === "on";
  } catch {
    return fallback;
  }
};

export const useAppSetting = (key: string, fallback: boolean) => {
  const [value, setValue] = useState(() => read(key, fallback));
  const change = useCallback(
    (on: boolean) => {
      setValue(on);
      try {
        localStorage.setItem(PREFIX + key, on ? "on" : "off");
      } catch {
        // not remembered past this run, which is all that is lost
      }
    },
    [key],
  );
  return [value, change] as const;
};

/** Like useAppSetting, for any value that survives JSON: a schedule, a quota. */
export const useAppValue = <T,>(key: string, fallback: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(PREFIX + key);
      return saved === null ? fallback : (JSON.parse(saved) as T);
    } catch {
      return fallback;
    }
  });
  const change = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // not remembered past this run
      }
    },
    [key],
  );
  return [value, change] as const;
};
