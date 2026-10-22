import { ClipboardPaste, X } from "lucide-react";

import { useT } from "../lib/i18n";

type ClipboardOfferProps = {
  urls: string[];
  onTake: () => void;
  onDismiss: () => void;
};

const nameOf = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
  } catch {
    return url;
  }
};

/** "3 links copied": offered when the window comes to the front with new file links on the clipboard. */
export const ClipboardOffer = ({ urls, onTake, onDismiss }: ClipboardOfferProps) => {
  const t = useT();
  return (
  <div className="mx-3 mt-3 flex items-center gap-3 rounded-card border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
    <ClipboardPaste className="size-4 shrink-0 text-accent" />
    <span className="min-w-0 truncate">
      {urls.length === 1 ? t.oneLinkCopied : t.linksCopied(urls.length)}
      <bdi className="font-semibold">{nameOf(urls[0])}</bdi>
    </span>
    <button
      type="button"
      onClick={onTake}
      className="ms-auto shrink-0 rounded-control button-primary px-3 py-1 font-semibold"
    >
      {t.download}
    </button>
    <button type="button" onClick={onDismiss} aria-label={t.notNow} title={t.notNow} className="shrink-0 text-muted hover:text-text">
      <X className="size-4" />
    </button>
  </div>
  );
};
