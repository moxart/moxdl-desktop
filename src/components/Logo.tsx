import { useEffect, useRef, useState } from "react";

import pomegranate from "../assets/pomegranate.png";
import { cn } from "../lib/format";

// The name in Yeseva One, with the app's pomegranate (icon-fruit.png) as its o. The letters are
// muted so the fruit is the only colour: the fruit and the name are one mark. Always left to
// right, Persian included: it is a name, not a word.
//
// It also shows how things stand, with no words: green letters and a nod of the fruit when the
// last download finishes, and fainter letters while downloads only wait, paused or outside the
// hours they may run. The fruit stays red whatever happens: it is the brand.

const GLOW_MS = 2600;

type LogoProps = {
  running: number;
  waiting: boolean; // unfinished downloads, none of them running
  finished: number; // how many are done, to notice one more
};

export const Logo = ({ running, waiting, finished }: LogoProps) => {
  const [glowing, setGlowing] = useState(false);
  const before = useRef({ running, finished });

  useEffect(() => {
    const was = before.current;
    before.current = { running, finished };
    // The queue ran dry because the last download finished, not because it was paused.
    if (was.running > 0 && running === 0 && finished > was.finished) {
      setGlowing(true);
      const timer = setTimeout(() => setGlowing(false), GLOW_MS);
      return () => clearTimeout(timer);
    }
  }, [running, finished]);

  return (
    <span
      dir="ltr"
      aria-label="Mox"
      className={cn(
        "flex items-center font-brand text-2xl leading-none transition-colors duration-500",
        glowing ? "text-ok" : waiting ? "text-faint" : "text-muted",
      )}
    >
      m
      <img src={pomegranate} alt="" className={cn("size-5 translate-y-0.5", glowing && "nod")} draggable={false} />
      x
    </span>
  );
};
