// The same units and rounding as the terminal, so both say the same thing.

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export const humanSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "?";
  let n = bytes;
  for (const unit of UNITS) {
    if (Math.abs(n) < 1024 || unit === "TB") return unit === "B" ? `${n.toFixed(0)} B` : `${n.toFixed(1)} ${unit}`;
    n /= 1024;
  }
  return "?";
};

export const humanTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return "--:--";
  const s = Math.max(0, Math.round(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
};

export const percent = (done: number, total: number | null): string =>
  total ? `${((100 * done) / total).toFixed(1)}%` : "";

/** Join class names, leaving out the false ones. */
export const cn = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
