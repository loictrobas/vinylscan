"use client";
import { Check, Minus } from "lucide-react";

interface RowCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  onClick?: (e: React.MouseEvent) => void;
}

export function RowCheckbox({ checked, indeterminate, onChange, onClick }: RowCheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(e); onChange(); }}
      aria-checked={indeterminate ? "mixed" : checked}
      role="checkbox"
      className={`relative w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all before:absolute before:inset-[-10px] before:content-[''] ${
        checked || indeterminate
          ? "bg-vs-accent border-vs-accent"
          : "border-vs-border-2 bg-vs-raised hover:border-vs-accent/60"
      }`}
    >
      {indeterminate && !checked
        ? <Minus size={11} className="text-vs-bg" strokeWidth={3} />
        : checked
          ? <Check size={11} className="text-vs-bg" strokeWidth={3} />
          : null
      }
    </button>
  );
}
