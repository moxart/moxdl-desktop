import pomegranate from "../assets/pomegranate.png";
import { Spinner } from "./Spinner";

// The app's pomegranate, from app-icon.png. While something downloads, the terminal's spinner
// turns beside the name, as the six dots of the old logo used to split and join.
export const Logo = ({ busy }: { busy: boolean }) => (
  <div className="flex items-center gap-2">
    <img src={pomegranate} alt="" className="size-7" draggable={false} />
    <span className="font-mono text-lg font-semibold tracking-tight">Mox</span>
    {busy && <Spinner className="w-3 font-mono text-accent" />}
  </div>
);
