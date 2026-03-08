import { useEffect } from "react";
import type { EnergyLevel } from "../api";

interface SoftLandingProps {
  onSelect: (energy: EnergyLevel) => void;
}

const OPTIONS: { energy: EnergyLevel; color: string; label: string }[] = [
  { energy: "calm", color: "bg-success", label: "good" },
  { energy: "neutral", color: "bg-info", label: "meh" },
  { energy: "rough", color: "bg-warn", label: "rough" },
];

export default function SoftLanding({ onSelect }: SoftLandingProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSelect("neutral");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <p className="text-text-secondary text-lg mb-8">How's it going?</p>
      <div className="flex gap-6">
        {OPTIONS.map(({ energy, color, label }) => (
          <button
            key={energy}
            onClick={() => onSelect(energy)}
            className="group flex flex-col items-center gap-3"
          >
            <div
              className={`size-16 rounded-full ${color}/20 border-2 border-transparent group-hover:border-current transition-all duration-200`}
              style={{ color: `var(--color-${energy === "calm" ? "success" : energy === "neutral" ? "info" : "warn"})` }}
            />
            <span className="text-xs text-text-muted group-hover:text-text-secondary transition-colors">
              {label}
            </span>
          </button>
        ))}
      </div>
      <p className="text-text-faint text-xs mt-10">esc to skip</p>
    </div>
  );
}
