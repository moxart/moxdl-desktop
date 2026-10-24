import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Brain } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { Quota, Schedule, Slow } from "../App";
import type { Learned } from "../engine/types";
import type { Engine } from "../engine/useEngine";
import type { Phone } from "../engine/usePhone";
import type { System } from "../engine/useSystem";
import type { Updates } from "../engine/useUpdates";
import { num, rate } from "../lib/format";
import { APP_VERSION } from "../lib/version";
import { type LangChoice, setLanguage, useLanguageChoice, useT } from "../lib/i18n";
import { type ThemeChoice, setTheme, useThemeChoice } from "../lib/theme";
import { PhoneSettings } from "./PhoneSettings";
import { Select } from "./Select";
import { VideoSettings } from "./VideoSettings";

// Settings are mox's own (mox config), shared with the terminal: changing one here changes it there.
const SWITCHES = new Set(["sort", "stream", "notify", "sound", "history"]);
const ON = ["on", "yes", "true", "1"];
const IN_APP = "__TAURI_INTERNALS__" in window;

const Field = ({ name, value, onSave }: { name: string; value: string; onSave: (value: string | null) => void }) => {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => draft.trim() !== value && onSave(draft.trim() || null);
  return (
    <input
      value={draft}
      placeholder={t.default}
      dir="auto"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && save()}
      aria-label={name}
      className="w-64 rounded-control border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
    />
  );
};

type SettingsViewProps = {
  engine: Engine;
  watchClipboard: boolean;
  onWatchClipboard: (on: boolean) => void;
  schedule: Schedule;
  onSchedule: (schedule: Schedule) => void;
  quota: Quota;
  onQuota: (quota: Quota) => void;
  updates: Updates;
  phone: Phone;
  slow: Slow;
  onSlow: (slow: Slow) => void;
  system: System;
  onWelcome: () => void;
};

// The speeds offered for the slow hours and the polite mode.
const LOWER = [256, 512, 1024, 2048, 5120].map((kb) => kb * 1024);

/** A speed to choose, in the language's digits: "512 KB/s". */
const SpeedSelect = ({ value, onChange, label }: { value: number; onChange: (bytes: number) => void; label: string }) => (
  <Select
    className="w-32"
    label={label}
    value={String(value)}
    options={(LOWER.includes(value) ? LOWER : [...LOWER, value].sort((a, b) => a - b)).map((v) => [rate(v, true), String(v)])}
    onChange={(v) => onChange(Number(v))}
  />
);

const inputClass = "rounded-control border border-line bg-bg px-2 py-1 text-sm tabular outline-none focus:border-accent";

/** A setting: what it is and what it does on one side, its control on the other. */
const Setting = ({ label, about, children }: { label: string; about: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-6">
    <span>
      <span className="block text-sm">{label}</span>
      <span className="block text-xs text-muted">{about}</span>
    </span>
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted">{children}</span>
  </div>
);

/** When downloads may run: only between two times, and only up to so much a day. */
const WhenToDownload = ({
  schedule,
  onSchedule,
  quota,
  onQuota,
  slow,
  onSlow,
  system,
  best,
}: Pick<SettingsViewProps, "schedule" | "onSchedule" | "quota" | "onQuota" | "slow" | "onSlow" | "system"> & {
  best: Learned["best"];
}) => {
  const t = useT();
  const suggested = best && !(schedule.on && schedule.from === best.from && schedule.until === best.until);
  return (
    <div className="mb-8 space-y-4">
      {/* What mox learned of this internet, offered where it is used. */}
      {suggested && (
        <div className="flex items-center gap-3 rounded-card border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
          <Brain className="size-4 shrink-0 text-accent" />
          <span className="flex-1">{t.hoursBest(num(best.from), num(best.until), num(best.factor))}</span>
          <button
            type="button"
            onClick={() => onSchedule({ on: true, from: best.from, until: best.until })}
            className="shrink-0 rounded-control button-primary px-3 py-1 font-semibold"
          >
            {t.useTheseHours}
          </button>
        </div>
      )}
      <div className="flex items-start justify-between gap-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={schedule.on}
            onChange={(e) => onSchedule({ ...schedule, on: e.target.checked })}
            className="mt-1 size-4 accent-accent"
          />
          <span>
            <span className="block text-sm">{t.scheduleOn}</span>
            <span className="block text-xs text-muted">{t.scheduleAbout}</span>
          </span>
        </label>
        {/* Times read left to right in any language, as on a clock. */}
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          <input type="time" dir="ltr" value={schedule.from} onChange={(e) => onSchedule({ ...schedule, from: e.target.value })} className={inputClass} aria-label={t.from} />
          {t.to}
          <input type="time" dir="ltr" value={schedule.until} onChange={(e) => onSchedule({ ...schedule, until: e.target.value })} className={inputClass} aria-label={t.until} />
        </span>
      </div>
      <div className="flex items-start justify-between gap-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={quota.on}
            onChange={(e) => onQuota({ ...quota, on: e.target.checked })}
            className="mt-1 size-4 accent-accent"
          />
          <span>
            <span className="block text-sm">{t.quotaOn}</span>
            <span className="block text-xs text-muted">{t.quotaAbout}</span>
          </span>
        </label>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={quota.gb}
            onChange={(e) => onQuota({ ...quota, gb: Number(e.target.value) })}
            className={`${inputClass} w-20`}
            aria-label={t.gbADay}
          />
          {t.gb}
        </span>
      </div>
      <div className="flex items-start justify-between gap-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={slow.on}
            onChange={(e) => onSlow({ ...slow, on: e.target.checked })}
            className="mt-1 size-4 accent-accent"
          />
          <span>
            <span className="block text-sm">{t.slowOn}</span>
            <span className="block text-xs text-muted">{t.slowAbout}</span>
          </span>
        </label>
        <span className="flex shrink-0 flex-col items-end gap-2 text-sm text-muted">
          <span className="flex items-center gap-2">
            <input type="time" dir="ltr" value={slow.from} onChange={(e) => onSlow({ ...slow, from: e.target.value })} className={inputClass} aria-label={t.from} />
            {t.to}
            <input type="time" dir="ltr" value={slow.until} onChange={(e) => onSlow({ ...slow, until: e.target.value })} className={inputClass} aria-label={t.until} />
          </span>
          <span className="flex items-center gap-2">
            {t.atMost}
            <SpeedSelect value={slow.limit} onChange={(limit) => onSlow({ ...slow, limit })} label={t.slowOn} />
          </span>
        </span>
      </div>
      <div className="flex items-start justify-between gap-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={system.polite.on}
            onChange={(e) => system.setPolite({ ...system.polite, on: e.target.checked })}
            className="mt-1 size-4 accent-accent"
          />
          <span>
            <span className="block text-sm">{t.politeOn}</span>
            <span className="block text-xs text-muted">{t.politeAbout}</span>
            {system.polite.on && !system.politeKnown && <span className="mt-1 block text-xs text-warn">{t.politeUnknown}</span>}
          </span>
        </label>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          {t.atMost}
          <SpeedSelect
            value={system.polite.limit}
            onChange={(limit) => system.setPolite({ ...system.polite, limit })}
            label={t.politeOn}
          />
        </span>
      </div>
    </div>
  );
};

/** Ctrl+Shift+M from anywhere, and the floating drop target. */
const Shortcuts = ({ system }: { system: System }) => {
  const t = useT();
  return (
    <div className="mb-8 space-y-4">
      <Switch label={t.browserStartOn} about={t.browserStartAbout} checked={system.browserStart} onChange={system.setBrowserStart} />
      <Switch label={t.hotkeyOn} about={t.hotkeyAbout} checked={system.hotkey} onChange={system.setHotkey} />
      {system.hotkey && (
        <p className={system.hotkeyProblem ? "text-xs text-danger" : "text-xs text-faint"}>{system.hotkeyProblem || t.hotkeyWayland}</p>
      )}
      <Switch label={t.dropzoneOn} about={t.dropzoneAbout} checked={system.dropzone} onChange={system.setDropzone} />
    </div>
  );
};

/** Start at login, as the system has it: null outside the app, where there is nothing to start. */
const useStartAtLogin = () => {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    isEnabled().then(setOn, () => setOn(null));
  }, []);
  const change = (wanted: boolean) =>
    (wanted ? enable() : disable()).then(
      () => isEnabled().then(setOn),
      () => {},
    );
  return [on, change] as const;
};

const Switch = ({ label, about, checked, onChange }: { label: string; about: string; checked: boolean; onChange: (on: boolean) => void }) => (
  <label className="flex cursor-pointer items-start justify-between gap-6">
    <span>
      <span className="block text-sm">{label}</span>
      <span className="block text-xs text-muted">{about}</span>
    </span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-accent" />
  </label>
);

const UpdateSettings = ({ updates, engineVersion }: { updates: Updates; engineVersion: string }) => {
  const t = useT();
  const { status, available } = updates;
  const result =
    status === "checking"
      ? t.checking
      : status === "current"
        ? t.upToDate
        : status === "failed"
          ? t.updateFailed(updates.problem)
          : available
            ? t.updateReady(available.version)
            : "";
  return (
    <>
      <Setting label={t.updates} about={t.updatesAbout(updates.version || APP_VERSION, engineVersion)}>
        {result && (
          <span className={status === "failed" ? "max-w-56 truncate text-danger" : "text-muted"} title={result}>
            {result}
          </span>
        )}
        {available && status !== "installing" ? (
          <button type="button" onClick={updates.install} className="rounded-control button-primary px-3 py-1.5 font-semibold">
            {t.updateInstall}
          </button>
        ) : (
          <button
            type="button"
            onClick={updates.check}
            disabled={status === "checking" || status === "installing"}
            className="rounded-control bg-raised px-3 py-1.5 text-text hover:bg-hover disabled:opacity-50"
          >
            {t.checkUpdates}
          </button>
        )}
      </Setting>
      <Switch label={t.autoCheck} about={t.autoCheckAbout} checked={updates.autoCheck} onChange={updates.setAutoCheck} />
    </>
  );
};

export const SettingsView = ({
  engine,
  watchClipboard,
  onWatchClipboard,
  schedule,
  onSchedule,
  quota,
  onQuota,
  updates,
  phone,
  slow,
  onSlow,
  system,
  onWelcome,
}: SettingsViewProps) => {
  const t = useT();
  const { config, send } = engine;
  const [startAtLogin, setStartAtLogin] = useStartAtLogin();
  const language = useLanguageChoice();
  const theme = useThemeChoice();
  useEffect(() => {
    send({ cmd: "config" });
    send({ cmd: "learned" });
  }, [send]);
  if (!config) return <p className="p-6 text-muted">{t.loading}</p>;

  const save = (key: string, value: string | null) => send({ cmd: "config_set", key, value });
  const [before, after] = t.moxSettingsAbout.split("{mox config}");

  return (
    <div className="max-w-3xl p-6">
      <h2 className="mb-3 text-sm font-semibold">{t.thisApp}</h2>
      <div className="mb-8 space-y-4">
        <Setting label={t.language} about={t.languageAbout}>
          <Select
            className="w-40"
            label={t.language}
            value={language}
            options={(["system", "en", "fa"] as const).map((l) => [t.languages[l], l])}
            onChange={(v) => setLanguage(v as LangChoice)}
          />
        </Setting>
        <Setting label={t.theme} about={t.themeAbout}>
          <Select
            className="w-40"
            label={t.theme}
            value={theme}
            options={(["system", "dark", "light"] as const).map((v) => [t.themes[v], v])}
            onChange={(v) => setTheme(v as ThemeChoice)}
          />
        </Setting>
        <Switch label={t.offerCopied} about={t.offerCopiedAbout} checked={watchClipboard} onChange={onWatchClipboard} />
        {startAtLogin !== null && (
          <Switch label={t.startAtLogin} about={t.startAtLoginAbout} checked={startAtLogin} onChange={setStartAtLogin} />
        )}
        {IN_APP && <UpdateSettings updates={updates} engineVersion={engine.version} />}
        <Setting label={t.showWelcome} about={t.showWelcomeAbout}>
          <button type="button" onClick={onWelcome} className="rounded-control bg-raised px-3 py-1.5 text-text hover:bg-hover">
            {t.show}
          </button>
        </Setting>
      </div>
      <h2 className="mb-3 text-sm font-semibold">{t.whenToDownload}</h2>
      <WhenToDownload
        schedule={schedule}
        onSchedule={onSchedule}
        quota={quota}
        onQuota={onQuota}
        slow={slow}
        onSlow={onSlow}
        system={system}
        best={engine.learned?.best ?? null}
      />
      <h2 className="mb-3 text-sm font-semibold">{t.videoSites}</h2>
      <VideoSettings engine={engine} quality={system.videoQuality} onQuality={system.setVideoQuality} />
      <h2 className="mb-3 text-sm font-semibold">{t.shortcuts}</h2>
      <Shortcuts system={system} />
      <h2 className="mb-3 text-sm font-semibold">{t.fromPhone}</h2>
      <PhoneSettings phone={phone} />
      <h2 className="mb-1 text-sm font-semibold">{t.moxSettings}</h2>
      <p className="mb-5 text-sm text-muted">
        {before}
        <code className="font-mono text-text">mox config</code>
        {after}{" "}
        <code className="font-mono" dir="ltr">
          {config.path}
        </code>
      </p>
      <ul className="divide-y divide-line">
        {Object.entries(config.keys).map(([key, about]) => {
          const value = config.settings[key] ?? "";
          return (
            <li key={key} className="flex items-center justify-between gap-6 py-3">
              <div className="min-w-0">
                <div className="font-mono text-sm">{key}</div>
                <div className="text-xs text-muted">{t.configKeys[key] ?? about}</div>
              </div>
              {SWITCHES.has(key) ? (
                <Select
                  className="w-64"
                  label={key}
                  value={value ? (ON.includes(value.toLowerCase()) ? "on" : "off") : ""}
                  options={[
                    [t.default, ""],
                    [t.on, "on"],
                    [t.off, "off"],
                  ]}
                  onChange={(v) => save(key, v || null)}
                />
              ) : (
                <Field name={key} value={value} onSave={(v) => save(key, v)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
