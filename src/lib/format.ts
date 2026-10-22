import { localDigits } from "./i18n";

// A size or a speed is one unit: in Persian its Latin unit must not drift away from its number,
// as in "MB / ۱٫۱ GB ۷۲۱٫۵". Isolated left to right, it reads "۷۲۱٫۵ MB" anywhere in a line.
const LRI = "\u2066";
const PDI = "\u2069";
const unit = (text: string) => (/[۰-۹]/.test(text) ? LRI + text + PDI : text);

// The same units and rounding as the terminal, so both say the same thing. In Persian, with
// Persian digits.

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export const humanSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "?";
  let n = bytes;
  for (const name of UNITS) {
    if (Math.abs(n) < 1024 || name === "TB")
      return unit(localDigits(name === "B" ? `${n.toFixed(0)} B` : `${n.toFixed(1)} ${name}`));
    n /= 1024;
  }
  return "?";
};

/** A speed, such as 3.5 MB/s, kept whole in Persian too. */
export const rate = (bytes: number | null | undefined, round = false): string => {
  const size = humanSize(bytes).replace(/[\u2066\u2069]/g, "");
  return unit(`${round ? size.replace(/[.٫][0۰] /, " ") : size}/s`);
};

export const humanTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return "--:--";
  return localDigits(clock(seconds));
};

const clock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
};

export const percent = (done: number, total: number | null): string =>
  total ? localDigits(`${((100 * done) / total).toFixed(1)}%`) : "";

/** A count or a time of day, in the language's digits. */
export const num = (value: number | string): string => localDigits(String(value));

/** Join class names, leaving out the false ones. */
export const cn = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
