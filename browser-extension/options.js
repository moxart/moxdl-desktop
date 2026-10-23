// The options page: switches for taking over downloads and for sending cookies. Cookies need the
// browser's own permission, asked for here when switched on and given back when switched off.

const api = globalThis.browser ?? globalThis.chrome;
const FA = (navigator.language || "").toLowerCase().startsWith("fa");
const T = FA
  ? {
      title: "دانلود با Mox",
      found: (port) => `Mox در حال اجراست (درگاه ${port})`,
      missing: "Mox در حال اجرا نیست؛ با اولین دانلود باز می‌شود",
      catch: "دانلودهای مرورگر به Mox برود",
      catchAbout: "فایل‌های کوچک‌تر از ۱ مگابایت پیش مرورگر می‌مانند، و دانلودی که ظرف یک دقیقه دوباره شروع شود هم",
      cookies: "فرستادن کوکی‌ها، برای سایت‌هایی که ورود می‌خواهند",
      cookiesAbout: "فقط به Mox روی همین کامپیوتر، فقط کوکی‌های سایت همان دانلود، و هرگز از پنجرهٔ خصوصی. مرورگر یک بار اجازه می‌خواهد",
    }
  : {
      title: "Download with Mox",
      found: (port) => `Mox is running (port ${port})`,
      missing: "Mox is not running; the first download starts it",
      catch: "Send the browser's downloads to Mox",
      catchAbout: "Files under 1 MB stay with the browser, and so does a download started again within a minute",
      cookies: "Send cookies, for sites that need a login",
      cookiesAbout: "Only to Mox on this computer, only the download's own site, and never from a private window. The browser asks once",
    };
if (FA) document.documentElement.dir = "rtl";

const $ = (id) => document.getElementById(id);
$("title").textContent = T.title;
$("catch-label").textContent = T.catch;
$("catch-about").textContent = T.catchAbout;
$("cookies-label").textContent = T.cookies;
$("cookies-about").textContent = T.cookiesAbout;

const COOKIES = { permissions: ["cookies"], origins: ["<all_urls>"] };

const show = async () => {
  $("catch").checked = (await api.storage.local.get("catch")).catch !== false;
  $("cookies").checked = await api.permissions.contains(COOKIES);
  const port = await api.runtime.sendMessage({ ask: "port" }).catch(() => null);
  $("status").textContent = port ? T.found(port) : T.missing;
  $("status").className = port ? "status ok" : "status";
};

$("catch").addEventListener("change", async (e) => {
  await api.storage.local.set({ catch: e.target.checked });
  api.runtime.sendMessage({ ask: "badge" }).catch(() => {});
});

// permissions.request must run straight from the click, before any other await.
$("cookies").addEventListener("change", (e) => {
  const asked = e.target.checked ? api.permissions.request(COOKIES) : api.permissions.remove(COOKIES);
  asked.then(show, show);
});

show();
