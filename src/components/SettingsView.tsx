import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";

import type { Quota, Schedule } from "../App";
import type { Engine } from "../engine/useEngine";
import { Select } from "./Select";

// Settings are mox's own (mox config), shared with the terminal: changing one here changes it there.
const SWITCHES = new Set(["sort", "stream", "notify", "sound", "history"]);
const ON = ["on", "yes", "true", "1"];

const Field = ({ name, value, onSave }: { name: string; value: string; onSave: (value: string | null) => void }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => draft.trim() !== value && onSave(draft.trim() || null);
  return (
    <input
      value={draft}
      placeholder="default"
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
};

const inputClass = "rounded-control border border-line bg-bg px-2 py-1 text-sm tabular outline-none focus:border-accent";

/** When downloads may run: only between two times, and only up to so much a day. */
const WhenToDownload = ({ schedule, onSchedule, quota, onQuota }: Omit<SettingsViewProps, "engine" | "watchClipboard" | "onWatchClipboard">) => (
  <div className="mb-8 space-y-4">
    <div className="flex items-start justify-between gap-6">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={schedule.on}
          onChange={(e) => onSchedule({ ...schedule, on: e.target.checked })}
          className="mt-1 size-4 accent-accent"
        />
        <span>
          <span className="block text-sm">Download only between two times</span>
          <span className="block text-xs text-muted">For a night plan. Outside it, downloads pause and keep what they have</span>
        </span>
      </label>
      <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
        <input type="time" value={schedule.from} onChange={(e) => onSchedule({ ...schedule, from: e.target.value })} className={inputClass} aria-label="From" />
        to
        <input type="time" value={schedule.until} onChange={(e) => onSchedule({ ...schedule, until: e.target.value })} className={inputClass} aria-label="Until" />
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
          <span className="block text-sm">Pause once today has had</span>
          <span className="block text-xs text-muted">For a data plan. Counts every download today, the terminal's too, and starts again tomorrow</span>
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
          aria-label="Gigabytes a day"
        />
        GB
      </span>
    </div>
  </div>
);

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

export const SettingsView = ({ engine, watchClipboard, onWatchClipboard, schedule, onSchedule, quota, onQuota }: SettingsViewProps) => {
  const { config, send } = engine;
  const [startAtLogin, setStartAtLogin] = useStartAtLogin();
  useEffect(() => send({ cmd: "config" }), [send]);
  if (!config) return <p className="p-6 text-muted">Loading…</p>;

  const save = (key: string, value: string | null) => send({ cmd: "config_set", key, value });

  return (
    <div className="max-w-3xl p-6">
      <h2 className="mb-3 text-sm font-semibold">This app</h2>
      <div className="mb-8 space-y-4">
        <Switch
          label="Offer copied links"
          about="When Mox comes to the front with new file links on the clipboard, ask whether to download them"
          checked={watchClipboard}
          onChange={onWatchClipboard}
        />
        {startAtLogin !== null && (
          <Switch
            label="Start Mox when I log in"
            about="In the tray, by the clock, carrying on with what was left unfinished"
            checked={startAtLogin}
            onChange={setStartAtLogin}
          />
        )}
      </div>
      <h2 className="mb-3 text-sm font-semibold">When to download</h2>
      <WhenToDownload schedule={schedule} onSchedule={onSchedule} quota={quota} onQuota={onQuota} />
      <h2 className="mb-1 text-sm font-semibold">Mox</h2>
      <p className="mb-5 text-sm text-muted">
        The same settings as <code className="font-mono text-text">mox config</code> in the terminal. Saved in{" "}
        <code className="font-mono">{config.path}</code>.
      </p>
      <ul className="divide-y divide-line">
        {Object.entries(config.keys).map(([key, about]) => {
          const value = config.settings[key] ?? "";
          return (
            <li key={key} className="flex items-center justify-between gap-6 py-3">
              <div className="min-w-0">
                <div className="font-mono text-sm">{key}</div>
                <div className="text-xs text-muted">{about}</div>
              </div>
              {SWITCHES.has(key) ? (
                <Select
                  className="w-64"
                  label={key}
                  value={value ? (ON.includes(value.toLowerCase()) ? "on" : "off") : ""}
                  options={[["default", ""], ["on", "on"], ["off", "off"]]}
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
