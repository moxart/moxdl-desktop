import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ClipboardPaste, Copy, FolderOpen, MousePointerClick, Smartphone, Upload } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { Schedule } from "../App";
import pomegranate from "../assets/pomegranate.png";
import type { System } from "../engine/useSystem";
import { cn, num } from "../lib/format";
import { type LangChoice, setLanguage, useLanguageChoice, useT } from "../lib/i18n";
import { type ThemeChoice, setTheme, useThemeChoice } from "../lib/theme";

const IN_APP = "__TAURI_INTERNALS__" in window;
const STEPS = 4;
const EXTENSIONS_PAGE = "chrome://extensions";

type WelcomeProps = {
  schedule: Schedule;
  onSchedule: (schedule: Schedule) => void;
  system: System;
  onDone: () => void;
  firstStep?: number; // for screenshots of a later step
};

/** A row of choices, one of them on: the language, the look. */
const Choices = <T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) => (
  <div className="grid grid-cols-3 gap-2">
    {options.map(([v, label]) => (
      <button
        key={v}
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={value === v}
        className={cn(
          "rounded-control px-3 py-2.5 text-sm transition-colors",
          value === v ? "button-primary font-semibold" : "bg-raised text-muted hover:bg-hover hover:text-text",
        )}
      >
        {label}
      </button>
    ))}
  </div>
);

const Hello = () => {
  const t = useT();
  const language = useLanguageChoice();
  const theme = useThemeChoice();
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <span dir="ltr" className="flex items-center font-brand text-5xl leading-none text-muted" aria-label="Mox">
          m
          <img src={pomegranate} alt="" className="size-11 translate-y-1" draggable={false} />x
        </span>
        <h1 className="mt-5 text-2xl font-extrabold">{t.welcome.helloTitle}</h1>
        <p className="mt-2 max-w-sm text-muted">{t.welcome.helloText}</p>
      </div>
      <div className="space-y-2">
        <span className="text-xs text-muted">{t.welcome.language}</span>
        <Choices<LangChoice>
          value={language}
          options={[
            ["system", t.languages.system],
            ["en", "English"],
            ["fa", "فارسی"],
          ]}
          onChange={setLanguage}
        />
      </div>
      <div className="space-y-2">
        <span className="text-xs text-muted">{t.welcome.theme}</span>
        <Choices<ThemeChoice>
          value={theme}
          options={[
            ["system", t.themes.system],
            ["dark", t.themes.dark],
            ["light", t.themes.light],
          ]}
          onChange={setTheme}
        />
      </div>
    </div>
  );
};

const Browser = () => {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (IN_APP) invoke<string>("extension_folder").then(setFolder, () => setMissing(true));
  }, []);
  const copy = () =>
    writeText(EXTENSIONS_PAGE).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">{t.welcome.browserTitle}</h1>
        <p className="mt-1.5 text-muted">{t.welcome.browserText}</p>
      </div>
      <div className="rounded-card border border-line bg-bg p-4">
        <p className="mb-3 text-sm font-semibold">{t.welcome.chromeTitle}</p>
        <ol className="space-y-2.5 text-sm">
          {t.welcome.chromeSteps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent-text">
                {num(i + 1)}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-2">
          <code dir="ltr" className="flex-1 rounded-control border border-line bg-surface px-3 py-2 font-mono text-sm select-text">
            {EXTENSIONS_PAGE}
          </code>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-control bg-raised px-3 text-sm hover:bg-hover">
            <Copy className="size-4" /> {copied ? t.welcome.copied : t.welcome.copyAddress}
          </button>
        </div>
        {missing ? (
          <p className="mt-3 text-xs text-warn">{t.welcome.noFolder}</p>
        ) : (
          <button
            type="button"
            disabled={IN_APP && !folder}
            onClick={() => folder && revealItemInDir(folder).catch(() => {})}
            className="mt-3 inline-flex items-center gap-2 rounded-control button-primary px-3 py-2 text-sm font-semibold"
          >
            <FolderOpen className="size-4" /> {t.welcome.showFolder}
          </button>
        )}
      </div>
      <p className="text-xs text-faint">{t.welcome.firefoxNote}</p>
    </div>
  );
};

const inputClass = "rounded-control border border-line bg-bg px-2 py-1 text-sm tabular outline-none focus:border-accent";

const Night = ({ schedule, onSchedule, system }: Pick<WelcomeProps, "schedule" | "onSchedule" | "system">) => {
  const t = useT();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">{t.welcome.nightTitle}</h1>
        <p className="mt-1.5 text-muted">{t.welcome.nightText}</p>
      </div>
      <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-card border border-line bg-bg p-4 text-sm">
        <input
          type="checkbox"
          checked={schedule.on}
          onChange={(e) => onSchedule({ ...schedule, on: e.target.checked })}
          className="size-4 accent-accent"
        />
        <span>{t.welcome.nightOn}</span>
        <span className="flex items-center gap-2 text-muted">
          <input type="time" dir="ltr" value={schedule.from} onChange={(e) => onSchedule({ ...schedule, from: e.target.value, on: true })} className={inputClass} aria-label={t.from} />
          {t.to}
          <input type="time" dir="ltr" value={schedule.until} onChange={(e) => onSchedule({ ...schedule, until: e.target.value, on: true })} className={inputClass} aria-label={t.until} />
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-bg p-4 text-sm">
        <input
          type="checkbox"
          checked={system.polite.on}
          onChange={(e) => system.setPolite({ ...system.polite, on: e.target.checked })}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block">{t.welcome.politeOn}</span>
          <span className="block text-xs text-muted">{t.welcome.politeText}</span>
        </span>
      </label>
      <p className="text-xs text-faint">{t.welcome.laterInSettings}</p>
    </div>
  );
};

const TIP_ICONS = [ClipboardPaste, Upload, MousePointerClick, Smartphone];

const Ready = () => {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <img src={pomegranate} alt="" className="nod size-16" draggable={false} />
        <h1 className="mt-3 text-2xl font-extrabold">{t.welcome.readyTitle}</h1>
        <p className="mt-1.5 text-muted">{t.welcome.readyText}</p>
      </div>
      <ul className="space-y-2">
        {t.welcome.tips.map((tip, i) => {
          const Icon = TIP_ICONS[i];
          return (
            <li key={tip} className="flex items-center gap-3 rounded-control bg-bg px-4 py-3 text-sm">
              <Icon className="size-4 shrink-0 text-accent" />
              {tip}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/**
 * The first run: the language and the look, the browser extension, a night plan, and the ways to
 * add links. Every step can be skipped, and Settings brings it back.
 */
export const Welcome = ({ schedule, onSchedule, system, onDone, firstStep = 0 }: WelcomeProps) => {
  const t = useT();
  const [step, setStep] = useState(Math.min(firstStep, STEPS - 1));
  const last = step === STEPS - 1;
  const next = () => (last ? onDone() : setStep((s) => s + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      // Not from a button or a field: a focused button takes Enter itself, and would go two steps.
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-bg/95 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal className="flex w-full max-w-xl flex-col rounded-card border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex gap-1.5" aria-label={t.welcome.step(step + 1, STEPS)}>
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-line")} />
            ))}
          </div>
          {!last && (
            <button type="button" onClick={onDone} className="text-sm text-muted hover:text-text">
              {t.welcome.skip}
            </button>
          )}
        </div>
        <div className="min-h-[22rem] px-6 py-6">
          {step === 0 && <Hello />}
          {step === 1 && <Browser />}
          {step === 2 && <Night schedule={schedule} onSchedule={onSchedule} system={system} />}
          {step === 3 && <Ready />}
        </div>
        <div className="flex items-center justify-between border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className={cn("rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text", step === 0 && "invisible")}
          >
            {t.welcome.back}
          </button>
          <button type="button" onClick={next} className="rounded-control button-primary px-5 py-2 font-semibold">
            {last ? t.welcome.start : t.welcome.next}
          </button>
        </div>
      </div>
    </div>
  );
};
