import { useEffect, useState } from "react";

// The terminal's spinner: one dot splitting into six and back, as one connection becomes many.
const FRAMES = "⠂⠅⠕⠝⠟⠿⠟⠝⠕⠅";
const FRAME_MS = 250;

export const Spinner = ({ className }: { className?: string }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, []);
  return <span className={className}>{FRAMES[frame]}</span>;
};
