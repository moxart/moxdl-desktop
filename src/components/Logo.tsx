import { useEffect, useState } from "react";

// The six dots of docs/logo.svg in mox, in the order the spinner adds them. While something
// downloads they split and join like the terminal's spinner; otherwise all six rest lit.
const ORDER: [number, number][] = [[0, 1], [0, 0], [1, 2], [1, 0], [0, 2], [1, 1]];
const COUNTS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2];

export const Logo = ({ busy }: { busy: boolean }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % COUNTS.length), 250);
    return () => clearInterval(timer);
  }, [busy]);
  const lit = busy ? COUNTS[frame] : 6;
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 28 38" className="h-6 w-auto" aria-hidden>
        {ORDER.map(([col, row], i) => (
          <circle
            key={i}
            cx={7 + col * 14}
            cy={7 + row * 12}
            r={4.5}
            className="fill-accent transition-opacity duration-200"
            opacity={i < lit ? 1 : 0.15}
          />
        ))}
      </svg>
      <span className="font-mono text-lg font-semibold tracking-tight">mox</span>
    </div>
  );
};
