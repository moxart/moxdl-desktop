import { ChevronDown } from "lucide-react";

import { cn } from "../lib/format";

type SelectProps = {
  value: string;
  options: [label: string, value: string][];
  onChange: (value: string) => void;
  label?: string; // for screen readers, when no visible label names it
  className?: string;
};

/** A dropdown in the theme's colors. The system's own is drawn light on Linux, whatever the theme. */
export const Select = ({ value, options, onChange, label, className }: SelectProps) => (
  <div className={cn("relative", className)}>
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="w-full cursor-pointer appearance-none rounded-control border border-line bg-bg py-1.5 ps-3 pe-8 text-sm text-text outline-none transition-colors hover:border-faint focus:border-accent"
    >
      {options.map(([text, v]) => (
        <option key={v} value={v} className="bg-raised text-text">
          {text}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
  </div>
);
