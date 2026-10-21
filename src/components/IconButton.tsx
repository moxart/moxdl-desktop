import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/format";

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
};

export const IconButton = ({ icon: Icon, label, onClick, active, danger }: IconButtonProps) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={cn(
      "grid size-8 place-items-center rounded-control transition-colors active:scale-95",
      danger ? "text-danger hover:bg-danger/15" : active ? "bg-accent/15 text-accent" : "text-muted hover:bg-hover hover:text-text",
    )}
  >
    <Icon className="size-4" strokeWidth={2} />
  </button>
);
