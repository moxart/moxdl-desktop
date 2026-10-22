import { useEffect, useState } from "react";

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
};

export const SettingsView = ({ engine, watchClipboard, onWatchClipboard }: SettingsViewProps) => {
  const { config, send } = engine;
  useEffect(() => send({ cmd: "config" }), [send]);
  if (!config) return <p className="p-6 text-muted">Loading…</p>;

  const save = (key: string, value: string | null) => send({ cmd: "config_set", key, value });

  return (
    <div className="max-w-3xl p-6">
      <h2 className="mb-3 text-sm font-semibold">This app</h2>
      <label className="mb-8 flex cursor-pointer items-start justify-between gap-6">
        <span>
          <span className="block text-sm">Offer copied links</span>
          <span className="block text-xs text-muted">
            When Mox comes to the front with new file links on the clipboard, ask whether to download them
          </span>
        </span>
        <input
          type="checkbox"
          checked={watchClipboard}
          onChange={(e) => onWatchClipboard(e.target.checked)}
          className="mt-1 size-4 accent-accent"
        />
      </label>
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
