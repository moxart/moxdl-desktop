import { Download } from "lucide-react";

/** Shown while links are dragged over the window from a browser or another app. */
export const DropOverlay = () => (
  <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/80 p-6">
    <div className="grid h-full w-full place-items-center rounded-card border-2 border-dashed border-accent/60">
      <div className="text-center">
        <Download className="mx-auto size-8 text-accent" />
        <p className="mt-3 font-medium">Drop links to download them</p>
      </div>
    </div>
  </div>
);
