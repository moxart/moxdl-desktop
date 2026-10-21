import { Plus } from "lucide-react";
import { useState } from "react";

import type { Command, EngineState } from "../engine/types";
import { DownloadRow } from "./DownloadRow";

type DownloadListProps = {
  state: EngineState | null;
  send: (command: Command) => void;
  onAdd: () => void;
};

const EmptyList = ({ onAdd }: { onAdd: () => void }) => (
  <div className="grid h-full place-items-center">
    <div className="text-center">
      <p className="text-muted">Nothing downloading.</p>
      <p className="mt-1 text-sm text-faint">Copy some links and press Ctrl+V here, or</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 font-medium text-on-accent transition-transform hover:bg-accent-strong active:scale-95"
      >
        <Plus className="size-4" /> Add links
      </button>
    </div>
  </div>
);

export const DownloadList = ({ state, send, onAdd }: DownloadListProps) => {
  const [dragged, setDragged] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const downloads = state?.downloads ?? [];
  if (!downloads.length) return <EmptyList onAdd={onAdd} />;

  const waiting = downloads.filter((d) => d.status === "waiting");
  const firstUnfinished = downloads.find((d) => d.status !== "done" && d.status !== "error");

  const drop = () => {
    if (dragged !== null && target !== null && dragged !== target) {
      // The list is the queue: its order is the order they download in.
      send({ cmd: "move", id: dragged, to: downloads.findIndex((d) => d.id === target) });
    }
    setDragged(null);
    setTarget(null);
  };

  return (
    <ul className="flex flex-col gap-1 p-3">
      {downloads.map((d) => (
        <DownloadRow
          key={d.id}
          download={d}
          place={d.status === "waiting" ? waiting.indexOf(d) + 1 : null}
          focused={state?.focus === d.id}
          first={firstUnfinished?.id === d.id}
          send={send}
          dragging={dragged === d.id}
          dropAbove={dragged !== null && target === d.id && dragged !== d.id}
          onDragStart={() => setDragged(d.id)}
          onDragOver={() => setTarget(d.id)}
          onDrop={drop}
          onDragEnd={() => {
            setDragged(null);
            setTarget(null);
          }}
        />
      ))}
    </ul>
  );
};
