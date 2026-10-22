import { readText } from "@tauri-apps/plugin-clipboard-manager";

// Links found the way mox finds them (urls_in, links_in and unescape_link in mox.py), so the
// app offers what mox would download.

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;
const PAGES = ["", ".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".cgi"];

const unescape = (url: string) => url.replace(/&amp;/g, "&");

/** Every http(s) link in the text, without the punctuation around it. */
export const urlsIn = (text: string): string[] =>
  [...new Set((text.match(URL_PATTERN) ?? []).map((url) => unescape(url.replace(/[.,;:)\]}>]+$/, ""))))];

/** Only the links to files, not to web pages: what is worth offering to download. */
export const fileLinksIn = (text: string): string[] =>
  urlsIn(text).filter((url) => {
    try {
      const name = new URL(url).pathname.split("/").pop() ?? "";
      const dot = name.lastIndexOf(".");
      return !PAGES.includes(dot > 0 ? name.slice(dot).toLowerCase() : "");
    } catch {
      return false;
    }
  });

/**
 * The clipboard's text, read by the app itself. Asking mox instead ran wl-paste, which on GNOME
 * opens a window of its own to read it: Mox lost focus and got it back, read again on getting
 * it, and the two went back and forth until the app froze.
 */
export const readClipboard = async (): Promise<string> => {
  try {
    return (await readText()) ?? "";
  } catch {
    return ""; // empty, holding an image, or outside the app (the browser demo)
  }
};
