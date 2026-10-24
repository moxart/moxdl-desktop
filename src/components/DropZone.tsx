import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import pomegranate from "../assets/pomegranate.png";
import { cn } from "../lib/format";
import { useT } from "../lib/i18n";

// A press that moves further than this is a drag of the window, not a click.
const DRAG_PX = 4;
// The ring of progress round the circle: its radius, in a 64-unit box.
const RING = 29;
const AROUND = 2 * Math.PI * RING;

type Overall = { busy: boolean; progress: number | null }; // from src-tauri/src/presence.rs

const textOf = (e: React.DragEvent) => e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");

/**
 * The floating drop target's own small window (src-tauri/src/dropzone.rs): a pomegranate to drop
 * links on, a click to bring Mox up, and a drag to move it.
 */
export const DropZone = () => {
  const t = useT();
  const [over, setOver] = useState(false);
  const [took, setTook] = useState(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  // How everything is going, as the app's shell tells this window: a ring while downloading.
  const [overall, setOverall] = useState<Overall>({ busy: false, progress: null });
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const stop = listen<Overall>("overall", (e) => setOverall(e.payload));
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  // The window is see-through around the circle.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    if (!took) return;
    const timer = setTimeout(() => setTook(false), 900);
    return () => clearTimeout(timer);
  }, [took]);

  return (
    <div
      className="relative grid h-screen w-screen cursor-pointer place-items-center select-none"
      title={t.dropHere}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const text = textOf(e);
        if (text) {
          setTook(true);
          invoke("dropped_links", { text }).catch(() => {});
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 0) press.current = { x: e.screenX, y: e.screenY };
      }}
      onMouseMove={(e) => {
        const at = press.current;
        if (at && Math.hypot(e.screenX - at.x, e.screenY - at.y) > DRAG_PX) {
          press.current = null;
          void getCurrentWindow().startDragging();
        }
      }}
      onMouseUp={() => {
        if (press.current) invoke("show_main").catch(() => {});
        press.current = null;
      }}
    >
      {overall.busy && (
        <svg viewBox="0 0 64 64" aria-hidden className={cn("pointer-events-none absolute size-16 -rotate-90", overall.progress === null && "animate-spin motion-reduce:animate-none")}>
          <circle cx="32" cy="32" r={RING} className="fill-none stroke-accent transition-[stroke-dashoffset] duration-700" strokeWidth={3} strokeLinecap="round" strokeDasharray={AROUND} strokeDashoffset={AROUND * (1 - (overall.progress ?? 0.25))} />
        </svg>
      )}
      <div
        className={cn(
          "grid size-14 place-items-center rounded-full border bg-surface shadow-lg transition-[transform,border-color,box-shadow] duration-200",
          over ? "scale-110 border-accent shadow-accent/40" : "border-line",
          took && "nod",
        )}
      >
        <img src={pomegranate} alt="Mox" className="size-9" draggable={false} />
      </div>
    </div>
  );
};
