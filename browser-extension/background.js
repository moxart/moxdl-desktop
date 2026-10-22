// Sends links to the Mox desktop app: from the right-click menu, and by taking over the
// browser's own downloads. Each time it opens a mox:// link, which the app registers, and the app
// shows the links in its add dialog for the user to start. The browser asks once whether to let
// it open Mox.

const api = globalThis.browser ?? globalThis.chrome;

const LINKS = /https?:\/\/[^\s<>"'`]+/g;
// What a link to a page rather than a file ends in, as mox's own --watch and --page see it.
const PAGES = ["", ".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".cgi"];
// Files the browser is told to be smaller than this stay with the browser: one connection does
// as well, and Mox's dialog would only be in the way.
const SMALL = 1024 * 1024;
// A download Mox was given, started again within this long, is the user asking for the
// browser after all (Mox was not wanted, or the site needs the browser's login): let it through.
const AGAIN_MS = 60_000;

const moxLink = (urls) => "mox://add?" + urls.map((url) => "url=" + encodeURIComponent(url)).join("&");

const isFile = (url) => {
  try {
    const name = new URL(url).pathname.split("/").pop();
    const dot = name.lastIndexOf(".");
    return dot > 0 && !PAGES.includes(name.slice(dot).toLowerCase());
  } catch {
    return false;
  }
};

// Runs inside the page, for "all file links": every link it has, as the browser resolved them.
const linksOnPage = () => [...document.querySelectorAll("a[href]")].map((a) => a.href);

const openInMox = async (urls, tab) => {
  const unique = [...new Set(urls)];
  if (!unique.length) return;
  const target = tab ?? (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target) api.tabs.update(target.id, { url: moxLink(unique) });
};

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({ id: "mox-link", title: "Download with Mox", contexts: ["link"] });
  api.contextMenus.create({
    id: "mox-selection",
    title: "Download the links in the selection with Mox",
    contexts: ["selection"],
  });
  api.contextMenus.create({
    id: "mox-page",
    title: "Download all file links on this page with Mox",
    contexts: ["page"],
  });
  showCatching();
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mox-link") {
    openInMox([info.linkUrl], tab);
  } else if (info.menuItemId === "mox-selection") {
    openInMox((info.selectionText ?? "").match(LINKS) ?? [], tab);
  } else if (info.menuItemId === "mox-page") {
    const [result] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: linksOnPage });
    openInMox((result?.result ?? []).filter(isFile), tab);
  }
});

// Taking over downloads: on unless switched off with the toolbar button.

const catching = async () => (await api.storage.local.get("catch")).catch !== false;

const showCatching = async () => {
  const on = await catching();
  api.action.setBadgeText({ text: on ? "" : "off" });
  api.action.setBadgeBackgroundColor({ color: "#8a7f82" });
  api.action.setTitle({
    title: on
      ? "Mox takes over downloads. Click to let the browser keep them"
      : "The browser keeps its downloads. Click to send them to Mox",
  });
};
api.runtime.onStartup.addListener(showCatching);

api.action.onClicked.addListener(async () => {
  await api.storage.local.set({ catch: !(await catching()) });
  showCatching();
});

// The service worker can be stopped between two downloads, so what was sent lives in session
// storage rather than in a variable.
const sentBefore = async (url) => {
  const { sent = {} } = await api.storage.session.get("sent");
  const now = Date.now();
  for (const [key, time] of Object.entries(sent)) if (now - time > AGAIN_MS) delete sent[key];
  const again = url in sent;
  if (again) delete sent[url];
  else sent[url] = now;
  await api.storage.session.set({ sent });
  return again;
};

api.downloads.onCreated.addListener(async (item) => {
  const url = item.finalUrl || item.url;
  // Not what a page made itself (blob:, data:), nor what is known to be small.
  if (!/^https?:/.test(url) || (item.totalBytes > 0 && item.totalBytes < SMALL)) return;
  if (!(await catching()) || (await sentBefore(url))) return;
  try {
    await api.downloads.cancel(item.id);
    await api.downloads.erase({ id: item.id });
  } catch {
    return; // finished already, or not ours to stop: the browser has it
  }
  openInMox([url]);
});
