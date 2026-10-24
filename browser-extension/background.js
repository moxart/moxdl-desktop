// Sends links to the Mox desktop app: from the right-click menu, and by taking over the
// browser's own downloads.
//
// The app listens on 127.0.0.1 for its extension alone (it checks the Origin, which pages cannot
// fake), so links go there and start at once, with the Referer and, if the user allows it on
// the options page, the site's cookies: downloads that need a login work too. When the app is
// not running, or is too old for that, a mox:// link starts it instead, and its add dialog asks
// first, as any web page could open such a link. The browser asks once whether to let it.

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

// Where the app listens: the first of these that answers /hello as Mox.
const PORTS = [6691, 6692, 6693];
const ASK_MS = 800;

// Video sites, for the "download the video" items: their pages, and links to them.
const VIDEO_SITES = [
  "youtube.com", "youtu.be", "aparat.com", "instagram.com", "vimeo.com", "x.com", "twitter.com",
  "tiktok.com", "dailymotion.com", "twitch.tv",
].flatMap((site) => [`*://${site}/*`, `*://*.${site}/*`]);

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
  const target = tab ?? (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target) api.tabs.update(target.id, { url: moxLink(urls) });
};

const askMox = (port, path, body) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(ASK_MS),
  });

// The port that answered last time first: the service worker forgets variables, not storage.
const findMox = async () => {
  const { moxPort } = await api.storage.session.get("moxPort");
  for (const port of [moxPort, ...PORTS.filter((p) => p !== moxPort)].filter(Boolean)) {
    try {
      const answer = await (await askMox(port, "/hello")).json();
      if (answer.app === "mox") {
        await api.storage.session.set({ moxPort: port });
        return port;
      }
    } catch {
      // not there, or not Mox
    }
  }
  return null;
};

const cookieAccess = () => api.permissions.contains({ permissions: ["cookies"], origins: ["<all_urls>"] });

/** What the browser would send with these links: who sent them there, as whom, and its login. */
const headersFor = async (urls, referrer, incognito) => {
  const headers = { "User-Agent": navigator.userAgent };
  if (referrer && /^https?:/.test(referrer)) headers.Referer = referrer;
  // One site's cookies only, and none from a private window, which is meant to leave no trace.
  const hosts = new Set(urls.map((url) => new URL(url).host));
  if (!incognito && hosts.size === 1 && (await cookieAccess())) {
    try {
      const cookies = await api.cookies.getAll({ url: urls[0] });
      if (cookies.length) headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } catch {
      // Firefox's first-party isolation wants more than a link: then it goes without
    }
  }
  return headers;
};

const send = async (urls, { tab, referrer, incognito, media = false } = {}) => {
  const unique = [...new Set(urls)].filter((url) => /^https?:/.test(url));
  if (!unique.length) return;
  const port = await findMox();
  if (port) {
    try {
      const headers = await headersFor(unique, referrer ?? tab?.url, incognito ?? tab?.incognito);
      // media: pages of a video site, which Mox reads with yt-dlp and downloads as video.
      if ((await askMox(port, "/add", { urls: unique, headers, media })).ok) return;
    } catch {
      // gone since /hello: the mox:// link below starts it again
    }
  }
  openInMox(unique, tab);
};

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({ id: "mox-link", title: "Download with Mox", contexts: ["link"] });
  api.contextMenus.create({
    id: "mox-selection",
    title: "Download the links in the selection with Mox",
    contexts: ["selection"],
  });
  api.contextMenus.create({
    id: "mox-video",
    title: "Download this video with Mox",
    contexts: ["page", "video"],
    documentUrlPatterns: VIDEO_SITES,
  });
  api.contextMenus.create({
    id: "mox-video-link",
    title: "Download the video at this link with Mox",
    contexts: ["link"],
    targetUrlPatterns: VIDEO_SITES,
  });
  api.contextMenus.create({
    id: "mox-page",
    title: "Download all file links on this page with Mox",
    contexts: ["page"],
  });
  showCatching();
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mox-video") {
    send([info.pageUrl ?? tab.url], { tab, media: true });
  } else if (info.menuItemId === "mox-video-link") {
    send([info.linkUrl], { tab, media: true });
  } else if (info.menuItemId === "mox-link") {
    send([info.linkUrl], { tab });
  } else if (info.menuItemId === "mox-selection") {
    send((info.selectionText ?? "").match(LINKS) ?? [], { tab });
  } else if (info.menuItemId === "mox-page") {
    const [result] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: linksOnPage });
    send((result?.result ?? []).filter(isFile), { tab });
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

// The options page asks where Mox is, and to redraw the badge after its switch.
api.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.ask === "port") {
    findMox().then(reply, () => reply(null));
    return true; // the answer comes later
  }
  if (message?.ask === "badge") showCatching();
  return false;
});

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
  send([url], { referrer: item.referrer, incognito: item.incognito });
});
