// Sends links to the Mox desktop app. It does nothing else: each menu item opens a mox:// link,
// which the app registers, and the app shows the links in its add dialog for the user to start.
// The browser asks once whether to let the page open Mox.

const api = globalThis.browser ?? globalThis.chrome;

const LINKS = /https?:\/\/[^\s<>"'`]+/g;
// What a link to a page rather than a file ends in, as mox's own --watch and --page see it.
const PAGES = ["", ".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".cgi"];

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

const send = (tab, urls) => {
  const unique = [...new Set(urls)];
  if (unique.length) api.tabs.update(tab.id, { url: moxLink(unique) });
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
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mox-link") {
    send(tab, [info.linkUrl]);
  } else if (info.menuItemId === "mox-selection") {
    send(tab, (info.selectionText ?? "").match(LINKS) ?? []);
  } else if (info.menuItemId === "mox-page") {
    const [result] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: linksOnPage });
    send(tab, (result?.result ?? []).filter(isFile));
  }
});
