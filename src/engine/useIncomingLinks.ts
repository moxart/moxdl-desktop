import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { fileLinksIn, readClipboard } from "../lib/links";
import type { Engine } from "./useEngine";

const IN_APP = "__TAURI_INTERNALS__" in window;

// The same file under a fresh link counts as the same: download sites change only the query.
const fileOf = (url: string) => url.split(/[?#]/)[0];

// The fewest milliseconds between two looks at the clipboard. Focus can come and go quickly,
// and nothing about one look should be able to set off the next.
const LOOK_EVERY = 2000;

const carriesLinks = (e: DragEvent) =>
  !!e.dataTransfer && [...e.dataTransfer.types].some((type) => type === "text/uri-list" || type === "text/plain");

/**
 * Links arriving from outside the window, each handed to `add` for the add dialog:
 * mox:// links from the browser, links dropped on the window, and file links on the clipboard,
 * offered when the window comes to the front.
 */
export const useIncomingLinks = (engine: Engine, add: (text: string) => void, watchClipboard: boolean) => {
  const { state } = engine;
  const [dropping, setDropping] = useState(false);
  const [offer, setOffer] = useState<string[]>([]);
  const seen = useRef<Set<string> | null>(null); // null until the first look, which only takes note
  const listed = useRef(new Set<string>());

  useEffect(() => {
    listed.current = new Set(state?.downloads.map((d) => fileOf(d.url)));
  }, [state]);

  // mox:// links, which the shell queues until this page is there to show them.
  useEffect(() => {
    if (!IN_APP) return;
    const pull = () =>
      invoke<string>("incoming_links")
        .then((text) => text && add(text))
        .catch(() => {});
    pull();
    const stop = listen("links-incoming", pull);
    return () => void stop.then((unlisten) => unlisten());
  }, [add]);

  // Links dragged in from a browser. Rows dragged within the list carry no text, so they pass.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!carriesLinks(e)) return;
      e.preventDefault();
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false); // off the window, not just onto a child
    };
    const drop = (e: DragEvent) => {
      setDropping(false);
      if (!carriesLinks(e)) return;
      e.preventDefault();
      const text = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain") || "";
      if (text.includes("://")) add(text);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [add]);

  // The clipboard, whenever the window comes to the front, read by the window itself: it has
  // the focus then, so reading changes nothing. Not in the background, where on Wayland a
  // program can only read it by taking the focus, and not through mox, whose wl-paste does.
  useEffect(() => {
    if (!watchClipboard) return;
    let last = 0;
    const look = async () => {
      if (Date.now() - last < LOOK_EVERY) return;
      last = Date.now();
      const urls = fileLinksIn(await readClipboard());
      if (seen.current === null) {
        seen.current = new Set(urls); // what was copied before Mox started is not news
        return;
      }
      const fresh = urls.filter((url) => !seen.current!.has(url) && !listed.current.has(fileOf(url)));
      urls.forEach((url) => seen.current!.add(url));
      if (fresh.length) setOffer(fresh);
    };
    look();
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, [watchClipboard]);

  const takeOffer = useCallback(() => {
    add(offer.join("\n"));
    setOffer([]);
  }, [add, offer]);
  const dismissOffer = useCallback(() => setOffer([]), []);

  return { dropping, offer, takeOffer, dismissOffer };
};
