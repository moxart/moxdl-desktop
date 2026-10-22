import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

// Every word the window shows, in English and Persian. Components take them from useT(); the
// rest of the code (toasts, number formats) from messages(). What mox itself says, an error from
// a server for one, stays as mox says it.

export type Lang = "en" | "fa";
export type LangChoice = Lang | "system";

const en = {
  tabs: { downloads: "Downloads", history: "History", settings: "Settings" },
  addLinks: "Add links",
  close: "Close",
  cancel: "Cancel",
  loading: "Loading…",

  engineMissing: "Mox could not be started",
  engineStopped: "Mox stopped",
  engineExited: "The download engine exited. Downloads keep their progress and continue when it starts again.",
  startAgain: "Start Mox again",

  dropLinks: "Drop links to download them",
  oneLinkCopied: "A link is copied: ",
  linksCopied: (n: number) => `${n} links are copied, starting with `,
  download: "Download",
  downloadCount: (n: number) => (n > 1 ? `Download ${n}` : "Download"),
  notNow: "Not now",

  keys: {
    select: "select",
    next: "download next",
    move: "move",
    only: "only this",
    watch: "watch while downloading",
    pause: "pause",
    open: "open",
    details: "details",
    remove: "remove",
    search: "search",
  },
  keyNames: { deleteTwice: "Delete twice" },
  nothingDownloading: "Nothing downloading.",
  emptyHint: "Copy some links and press Ctrl+V here, drop them on the window, or",
  searchDownloads: "Search downloads",
  clearSearch: "Clear the search",
  noMatch: (query: string) => `No download has “${query}” in its name.`,

  freshLinkHint: "Copy a fresh link and add it again to continue.",
  paused: "Paused",
  next: "Next",
  waitingPlace: (n: number) => `Waiting · #${n}`,
  waiting: "Waiting",
  playableTo: (p: string) => `Playable to ${p}`,
  fullSpeed: "full speed",
  watch: "watch",
  resume: "Continue",
  pause: "Pause",
  downloadNext: "Download next",
  shareSpeed: "Share the speed again",
  onlyThis: "Only this one, at full speed",
  stopInOrder: "Stop downloading in order",
  watchWhile: "Download from the start, to watch while it downloads",
  open: "Open",
  showInFolder: "Show in folder",
  tryAgain: "Try again",
  removeConfirm: "Click again to remove. The partial file stays, to continue later",
  remove: "Remove from the list",

  status: {
    waiting: "Waiting its turn",
    held: "Paused",
    connecting: "Connecting",
    downloading: "Downloading",
    verifying: "Checking the file",
    done: "Done",
    error: "Failed",
    paused: "Paused",
  },
  pieceMap: "Which parts of the file are on disk",
  speedLastMinute: "Speed, last minute",
  size: "Size",
  sizeOf: (done: string, total: string) => `${done} of ${total}`,
  timeLeft: "Time left",
  connections: "Connections",
  kind: "Kind",
  kinds: {
    video: "video",
    audio: "audio",
    image: "image",
    document: "document",
    archive: "archive",
    program: "program",
    "disk image": "disk image",
    subtitle: "subtitle",
    other: "other",
  } as Record<string, string>,
  playableToLabel: "Playable to",
  link: "Link",
  copy: "Copy",
  copied: "Copied",
  savedTo: "Saved to",
  show: "Show",
  expiredFresh: "The link has expired. Paste a fresh one for the same file:",
  freshLink: "A fresh link for the same file",
  use: "Use",

  doneCount: (done: number, all: number) => `${done}/${all} done`,
  failedCount: (n: number) => ` · ${n} failed`,
  only: (name: string) => `Only ${name}`,
  waitingFor: (time: string) => `Waiting for ${time}`,
  quotaReached: (size: string) => `Today's ${size} reached, until tomorrow`,
  todayOf: (today: string, quota: string) => `Today ${today} of ${quota}`,
  free: (size: string) => `${size} free`,
  freeTitle: "Free where downloads go",
  pauseAll: "Pause all",
  resumeAll: "Resume all",
  clearFinished: "Clear finished",
  atOnce: "At once",
  speed: "Speed",
  noLimit: "No limit",
  whenDone: "When done",
  whenDoneOptions: { nothing: "Do nothing", quit: "Quit Mox", sleep: "Sleep", shutdown: "Shut down" },
  countdown: {
    quit: (s: string) => `Mox quits in ${s} seconds`,
    sleep: (s: string) => `The computer sleeps in ${s} seconds`,
    shutdown: (s: string) => `The computer shuts down in ${s} seconds`,
  },
  countdownAbout: "Everything has downloaded.",
  now: "Now",

  updateReady: (version: string) => `Mox ${version} is out`,
  updateInstall: "Update and restart",
  updating: (part: string) => `Updating… ${part}`,
  updateFailed: (why: string) => `The update failed: ${why}`,

  thisApp: "This app",
  offerCopied: "Offer copied links",
  offerCopiedAbout: "When Mox comes to the front with new file links on the clipboard, ask whether to download them",
  startAtLogin: "Start Mox when I log in",
  startAtLoginAbout: "In the tray, by the clock, carrying on with what was left unfinished",
  language: "Language",
  languageAbout: "The words in this window, the tray and the notifications",
  languages: { system: "As the system", en: "English", fa: "فارسی" },
  theme: "Theme",
  themeAbout: "Light or dark, or as the system is set",
  themes: { system: "As the system", dark: "Dark", light: "Light" },
  updates: "Updates",
  updatesAbout: (version: string) => `This is Mox ${version}. New versions install themselves when you say so`,
  checkUpdates: "Check now",
  checking: "Checking…",
  upToDate: "Up to date",
  autoCheck: "Look for updates once a day",
  autoCheckAbout: "Only asks GitHub whether there is a newer version; nothing downloads without you",
  whenToDownload: "When to download",
  scheduleOn: "Download only between two times",
  scheduleAbout: "For a night plan. Outside it, downloads pause and keep what they have",
  from: "From",
  to: "to",
  until: "Until",
  quotaOn: "Pause once today has had",
  quotaAbout: "For a data plan. Counts every download today, the terminal's too, and starts again tomorrow",
  gbADay: "Gigabytes a day",
  gb: "GB",
  moxSettings: "Mox",
  moxSettingsAbout: "The same settings as {mox config} in the terminal. Saved in",
  default: "default",
  on: "on",
  off: "off",
  configKeys: {} as Record<string, string>, // mox's own words, in English

  noHistory: "No history is kept. Turn it on in Settings.",
  receivedToday: "Received today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  searchHistory: "Search the history",

  pasteHere: "Paste links here, one per line, or text with links in it",
  linkCount: (n: number) => (n ? `${n} link${n === 1 ? "" : "s"}` : "No links yet"),
  fromClipboard: "From the clipboard",
  saveTo: "Save to",
  saveToPlaceholder: "Downloads, unless Settings name another folder",
  choose: "Choose",
  sortFolders: "Sort into folders",
  sortFoldersHint: "In a mox folder there: Videos, Music and so on, and series by show and season",
  watchWhileDownloading: "Watch while downloading",
  watchWhileHint: "Fill each file from the start, to play it before it is done",
  addFirst: "First in line",
  addFirstHint: "Ahead of everything waiting, so these start now rather than at the end of the list",

  downloaded: (name: string) => `Downloaded ${name}`,
};

export type Messages = typeof en;

// Numbers inside the Persian words get Persian digits too.
const d = (n: number) => localDigits(String(n));

const fa: Messages = {
  tabs: { downloads: "دانلودها", history: "تاریخچه", settings: "تنظیمات" },
  addLinks: "افزودن لینک",
  close: "بستن",
  cancel: "انصراف",
  loading: "در حال بارگذاری…",

  engineMissing: "Mox اجرا نشد",
  engineStopped: "Mox متوقف شد",
  engineExited: "موتور دانلود بسته شد. دانلودها پیشرفتشان را نگه می‌دارند و با اجرای دوباره ادامه می‌دهند.",
  startAgain: "اجرای دوبارهٔ Mox",

  dropLinks: "لینک‌ها را اینجا رها کنید تا دانلود شوند",
  oneLinkCopied: "یک لینک کپی شده: ",
  linksCopied: (n) => `${d(n)} لینک کپی شده، اولی: `,
  download: "دانلود",
  downloadCount: (n) => (n > 1 ? `دانلود ${d(n)} فایل` : "دانلود"),
  notNow: "الان نه",

  keys: {
    select: "انتخاب",
    next: "دانلود بعدی",
    move: "جابه‌جایی",
    only: "فقط همین",
    watch: "تماشا حین دانلود",
    pause: "توقف",
    open: "باز کردن",
    details: "جزئیات",
    remove: "حذف",
    search: "جستجو",
  },
  keyNames: { deleteTwice: "دو بار Delete" },
  nothingDownloading: "دانلودی در کار نیست.",
  emptyHint: "چند لینک کپی کنید و اینجا Ctrl+V بزنید، روی پنجره رهایشان کنید، یا",
  searchDownloads: "جستجو در دانلودها",
  clearSearch: "پاک کردن جستجو",
  noMatch: (query) => `دانلودی با «${query}» در نامش نیست.`,

  freshLinkHint: "برای ادامه، لینک تازه‌ای کپی کنید و دوباره اضافه‌اش کنید.",
  paused: "متوقف",
  next: "نفر بعد",
  waitingPlace: (n) => `در صف · نفر ${d(n)}`,
  waiting: "در صف",
  playableTo: (p) => `قابل پخش تا ${p}`,
  fullSpeed: "تمام سرعت",
  watch: "تماشا",
  resume: "ادامه",
  pause: "توقف",
  downloadNext: "دانلود بعدی باشد",
  shareSpeed: "تقسیم دوبارهٔ سرعت",
  onlyThis: "فقط همین، با تمام سرعت",
  stopInOrder: "دیگر به ترتیب دانلود نشود",
  watchWhile: "از ابتدا دانلود شود تا حین دانلود تماشا کنید",
  open: "باز کردن",
  showInFolder: "نمایش در پوشه",
  tryAgain: "تلاش دوباره",
  removeConfirm: "برای حذف دوباره کلیک کنید. فایل نیمه‌کاره می‌ماند تا بعداً ادامه دهید",
  remove: "حذف از فهرست",

  status: {
    waiting: "در صف",
    held: "متوقف",
    connecting: "در حال اتصال",
    downloading: "در حال دانلود",
    verifying: "در حال بررسی فایل",
    done: "تمام شد",
    error: "ناموفق",
    paused: "متوقف",
  },
  pieceMap: "کدام بخش‌های فایل روی دیسک است",
  speedLastMinute: "سرعت در یک دقیقهٔ اخیر",
  size: "حجم",
  sizeOf: (done, total) => `${done} از ${total}`,
  timeLeft: "زمان باقی‌مانده",
  connections: "اتصال‌ها",
  kind: "نوع",
  kinds: {
    video: "ویدیو",
    audio: "صدا",
    image: "تصویر",
    document: "سند",
    archive: "فایل فشرده",
    program: "برنامه",
    "disk image": "ایمیج دیسک",
    subtitle: "زیرنویس",
    other: "سایر",
  },
  playableToLabel: "قابل پخش تا",
  link: "لینک",
  copy: "کپی",
  copied: "کپی شد",
  savedTo: "ذخیره در",
  show: "نمایش",
  expiredFresh: "لینک منقضی شده. لینک تازه‌ای از همین فایل بچسبانید:",
  freshLink: "لینک تازه برای همین فایل",
  use: "استفاده",

  doneCount: (done, all) => `${d(done)} از ${d(all)} تمام شد`,
  failedCount: (n) => ` · ${d(n)} ناموفق`,
  only: (name) => `فقط ${name}`,
  waitingFor: (time) => `در انتظار ساعت ${time}`,
  quotaReached: (size) => `سهمیهٔ ${size} امروز تمام شد، تا فردا`,
  todayOf: (today, quota) => `امروز ${today} از ${quota}`,
  free: (size) => `${size} فضای خالی`,
  freeTitle: "فضای خالی جایی که دانلودها ذخیره می‌شوند",
  pauseAll: "توقف همه",
  resumeAll: "ادامهٔ همه",
  clearFinished: "پاک کردن تمام‌شده‌ها",
  atOnce: "هم‌زمان",
  speed: "سرعت",
  noLimit: "بدون محدودیت",
  whenDone: "پس از پایان",
  whenDoneOptions: { nothing: "کاری نکن", quit: "بستن Mox", sleep: "خواب", shutdown: "خاموش کردن" },
  countdown: {
    quit: (s) => `Mox تا ${s} ثانیهٔ دیگر بسته می‌شود`,
    sleep: (s) => `کامپیوتر تا ${s} ثانیهٔ دیگر به خواب می‌رود`,
    shutdown: (s) => `کامپیوتر تا ${s} ثانیهٔ دیگر خاموش می‌شود`,
  },
  countdownAbout: "همهٔ دانلودها تمام شد.",
  now: "همین الان",

  updateReady: (version) => `نسخهٔ ${version} از Mox آمده`,
  updateInstall: "به‌روزرسانی و اجرای دوباره",
  updating: (part) => `در حال به‌روزرسانی… ${part}`,
  updateFailed: (why) => `به‌روزرسانی انجام نشد: ${why}`,

  thisApp: "این برنامه",
  offerCopied: "پیشنهاد لینک‌های کپی‌شده",
  offerCopiedAbout: "وقتی Mox جلو می‌آید و لینک فایل تازه‌ای در کلیپ‌بورد هست، بپرسد دانلود شود یا نه",
  startAtLogin: "اجرای Mox هنگام ورود به سیستم",
  startAtLoginAbout: "در کنار ساعت، و ادامهٔ کارهای نیمه‌تمام",
  language: "زبان",
  languageAbout: "زبان این پنجره، منوی کنار ساعت و اعلان‌ها",
  languages: { system: "مثل سیستم", en: "English", fa: "فارسی" },
  theme: "پوسته",
  themeAbout: "روشن یا تیره، یا مثل تنظیم سیستم",
  themes: { system: "مثل سیستم", dark: "تیره", light: "روشن" },
  updates: "به‌روزرسانی",
  updatesAbout: (version) => `این Mox نسخهٔ ${version} است. نسخه‌های تازه با اجازهٔ شما خودشان نصب می‌شوند`,
  checkUpdates: "بررسی",
  checking: "در حال بررسی…",
  upToDate: "به‌روز است",
  autoCheck: "روزی یک بار دنبال نسخهٔ تازه بگردد",
  autoCheckAbout: "فقط از GitHub می‌پرسد نسخهٔ تازه‌ای هست یا نه؛ بدون شما چیزی دانلود نمی‌شود",
  whenToDownload: "زمان دانلود",
  scheduleOn: "فقط بین دو ساعت دانلود شود",
  scheduleAbout: "برای بستهٔ شبانه. بیرون از این بازه دانلودها می‌ایستند و چیزی از دست نمی‌رود",
  from: "از",
  to: "تا",
  until: "تا",
  quotaOn: "توقف وقتی امروز به این مقدار رسید",
  quotaAbout: "برای بستهٔ حجمی. همهٔ دانلودهای امروز، حتی از ترمینال، شمرده می‌شوند و فردا از نو",
  gbADay: "گیگابایت در روز",
  gb: "GB",
  moxSettings: "Mox",
  moxSettingsAbout: "همان تنظیمات {mox config} در ترمینال. ذخیره در",
  default: "پیش‌فرض",
  on: "روشن",
  off: "خاموش",
  configKeys: {
    dir: "پوشهٔ ذخیره",
    sort: "هر نوع فایل در پوشهٔ خودش، و سریال‌ها بر اساس نام و فصل",
    "sort-root": "پوشه‌ای در dir که مرتب‌سازی در آن انجام می‌شود (پیش‌فرض: mox)؛ . برای خود dir",
    stream: "پر کردن فایل‌ها از ابتدا، برای تماشا حین دانلود",
    connections: "تعداد اتصال برای هر فایل",
    jobs: "تعداد فایل‌هایی که هم‌زمان دانلود می‌شوند",
    limit: "سقف کل سرعت، مثل 2M",
    retries: "تعداد تلاش دوباره برای هر اتصال",
    timeout: "مهلت شبکه به ثانیه",
    proxy: "پروکسی برای همهٔ درخواست‌ها",
    "fallback-proxy": "پروکسی SOCKS5 فقط برای سرورهایی که مستقیم در دسترس نیستند، یا auto",
    notify: "اعلان دسکتاپ یا تلگرام پس از پایان",
    sound: "صدای ملایم پس از پایان",
    history: "نگه داشتن تاریخچهٔ دانلودها",
  },

  noHistory: "تاریخچه‌ای نگه داشته نمی‌شود. از تنظیمات روشنش کنید.",
  receivedToday: "دریافت امروز",
  last7: "۷ روز اخیر",
  last30: "۳۰ روز اخیر",
  searchHistory: "جستجو در تاریخچه",

  pasteHere: "لینک‌ها را اینجا بچسبانید، هر کدام در یک خط، یا متنی که لینک دارد",
  linkCount: (n) => (n ? `${d(n)} لینک` : "هنوز لینکی نیست"),
  fromClipboard: "از کلیپ‌بورد",
  saveTo: "ذخیره در",
  saveToPlaceholder: "پوشهٔ Downloads، مگر در تنظیمات پوشهٔ دیگری آمده باشد",
  choose: "انتخاب",
  sortFolders: "مرتب‌سازی در پوشه‌ها",
  sortFoldersHint: "در پوشهٔ mox همان‌جا: ویدیو، موسیقی و غیره، و سریال‌ها بر اساس نام و فصل",
  watchWhileDownloading: "تماشا حین دانلود",
  watchWhileHint: "هر فایل از ابتدا پر شود تا پیش از تمام شدن پخش شود",
  addFirst: "اول صف",
  addFirstHint: "جلوتر از همهٔ دانلودهای در صف، تا همین حالا شروع شوند نه در انتهای لیست",

  downloaded: (name) => `${name} دانلود شد`,
};

const MESSAGES: Record<Lang, Messages> = { en, fa };
const KEY = "mox.language";

const systemLang = (): Lang => (navigator.language.toLowerCase().startsWith("fa") ? "fa" : "en");

const savedChoice = (): LangChoice => {
  // ?lang=fa in a plain browser (npm run dev), for screenshots of either language.
  const asked = "__TAURI_INTERNALS__" in window ? null : new URLSearchParams(location.search).get("lang");
  if (asked === "en" || asked === "fa") return asked;
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "en" || saved === "fa" ? saved : "system";
  } catch {
    return "system";
  }
};

let choice: LangChoice = savedChoice();
let lang: Lang = choice === "system" ? systemLang() : choice;
const listeners = new Set<() => void>();

const apply = () => {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  // The tray menu and the notifications follow; outside the app there are none.
  if ("__TAURI_INTERNALS__" in window) invoke("set_language", { lang }).catch(() => {});
};
apply();

export const setLanguage = (next: LangChoice) => {
  choice = next;
  lang = next === "system" ? systemLang() : next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // only this run speaks it
  }
  apply();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The words in the current language; the component shows them again when it changes. */
export const useT = (): Messages => MESSAGES[useSyncExternalStore(subscribe, () => lang)];

export const useLanguageChoice = () => useSyncExternalStore(subscribe, () => choice);

/** The words outside a component, as they are now. */
export const messages = (): Messages => MESSAGES[lang];

/** Persian digits and decimal sign in Persian, so numbers read as the words around them. */
export const localDigits = (text: string): string =>
  lang === "fa"
    ? text
        .replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)])
        .replace(/([۰-۹])\.(?=[۰-۹])/g, "$1٫")
        .replace(/%/g, "٪")
    : text;
