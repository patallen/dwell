import type { ActivePrompt, PromptType } from "../hooks/useBodyPrompts";

const PROMPT_ICONS: Record<PromptType, string> = {
  water: "~",
  movement: "^",
  meal: "*",
};

const PROMPT_COLORS: Record<PromptType, string> = {
  water: "text-info",
  movement: "text-success",
  meal: "text-warn",
};

const PULSE_COLORS: Record<PromptType, string> = {
  water: "bg-info/20",
  movement: "bg-success/20",
  meal: "bg-warn/20",
};

interface AmbientPulseProps {
  prompt: ActivePrompt;
  label: string;
  onAcknowledge: (type: PromptType) => void;
  onSnooze: (type: PromptType) => void;
}

export default function AmbientPulse({ prompt, label, onAcknowledge, onSnooze }: AmbientPulseProps) {
  return (
    <div className="flex items-center gap-2 animate-pulse-slow">
      <div className={`size-1.5 rounded-full ${PULSE_COLORS[prompt.type]} ring-2 ring-current ${PROMPT_COLORS[prompt.type]}`} />
      <span className={`${PROMPT_COLORS[prompt.type]} text-xs`}>
        {PROMPT_ICONS[prompt.type]} {label}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onAcknowledge(prompt.type); }}
        className="text-xs text-text-muted hover:text-text transition-colors"
        title="Got it"
      >
        ok
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onSnooze(prompt.type); }}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        title="Remind me later"
      >
        later
      </button>
    </div>
  );
}
