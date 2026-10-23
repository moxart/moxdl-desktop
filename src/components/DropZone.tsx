import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import pomegranate from "../assets/pomegranate.png";
import { cn } from "../lib/format";
import { useT } from "../lib/i18n";

// A press that moves further than this is a drag of the window, not a click.
const DRAG_PX = 4;

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
      className="grid h-screen w-screen cursor-pointer place-items-center select-none"
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
