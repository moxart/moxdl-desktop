import { useEffect, useRef, useState } from "react";

const SECONDS = 60; // how far back the graph goes
const WIDTH = 96;
const HEIGHT = 18;

/** The total speed over the last minute, one point a second, as a small line. */
export const SpeedGraph = ({ speed }: { speed: number }) => {
  const latest = useRef(speed);
  latest.current = speed;
  const [points, setPoints] = useState<number[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setPoints((all) => [...all, latest.current].slice(-SECONDS)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (points.length < 2 || Math.max(...points) === 0) return null;
  const top = Math.max(...points);
  const step = WIDTH / (SECONDS - 1);
  const start = (SECONDS - points.length) * step; // the newest point always sits at the right
  const line = points.map((v, i) => `${(start + i * step).toFixed(1)},${(HEIGHT - 1 - (v / top) * (HEIGHT - 2)).toFixed(1)}`);
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden className="shrink-0">
      <polyline points={`${start},${HEIGHT} ${line.join(" ")} ${WIDTH},${HEIGHT}`} className="fill-accent/15 stroke-none" />
      <polyline points={line.join(" ")} className="fill-none stroke-accent" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
};
