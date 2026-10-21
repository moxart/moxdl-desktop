import { cn } from "../lib/format";

// The progress bar is the piece map, as in the terminal: each cell is a slice of the file,
// shaded by how much of it is on disk.
const SHADES = ["bg-piece-0", "bg-piece-1", "bg-piece-2", "bg-piece-3"];

type PieceBarProps = { pieces: number[] | null; active: boolean; done: boolean };

export const PieceBar = ({ pieces, active, done }: PieceBarProps) => {
  if (done) return <div className="h-1.5 w-full rounded-full bg-ok/50" />;
  if (!pieces) {
    // Unknown size: a pulse that shows it is alive.
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-piece-0">
        {active && <div className="h-full w-1/4 animate-pulse rounded-full bg-accent" />}
      </div>
    );
  }
  return (
    <div className={cn("flex h-1.5 w-full gap-px overflow-hidden rounded-full", !active && "opacity-45")}>
      {pieces.map((shade, i) => (
        <span key={i} className={cn("h-full flex-1", SHADES[shade])} />
      ))}
    </div>
  );
};
