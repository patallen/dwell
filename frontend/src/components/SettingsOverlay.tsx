import type { useBodyPrompts, PromptType } from "../hooks/useBodyPrompts";
import type { useSessionTimer } from "../hooks/useSessionTimer";
import OverlayShell from "./OverlayShell";

interface SettingsOverlayProps {
  onClose: () => void;
  bodyPrompts: ReturnType<typeof useBodyPrompts>;
  sessionTimer: ReturnType<typeof useSessionTimer>;
}

export default function SettingsOverlay({ onClose, bodyPrompts, sessionTimer }: SettingsOverlayProps) {
  return (
    <OverlayShell onClose={onClose}>
      <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">Settings</h3>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">Body prompts</span>
          <button
            onClick={() => bodyPrompts.updateConfig({ enabled: !bodyPrompts.config.enabled })}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              bodyPrompts.config.enabled ? "bg-success/15 text-success" : "bg-surface text-text-muted"
            }`}
          >
            {bodyPrompts.config.enabled ? "on" : "off"}
          </button>
        </div>
        {bodyPrompts.config.enabled && (
          <div className="flex flex-col gap-2 pl-1">
            {(["water", "movement", "meal"] as PromptType[]).map((type) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-text-muted capitalize">{type}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const cur = bodyPrompts.config.intervals[type];
                      if (cur > 15) bodyPrompts.updateConfig({ intervals: { ...bodyPrompts.config.intervals, [type]: cur - 15 } });
                    }}
                    className="text-xs text-text-muted hover:text-text px-1"
                  >-</button>
                  <span className="text-xs text-text-secondary w-12 text-center">{bodyPrompts.config.intervals[type]}m</span>
                  <button
                    onClick={() => {
                      const cur = bodyPrompts.config.intervals[type];
                      bodyPrompts.updateConfig({ intervals: { ...bodyPrompts.config.intervals, [type]: cur + 15 } });
                    }}
                    className="text-xs text-text-muted hover:text-text px-1"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">Session guardrails</span>
          <button
            onClick={() => sessionTimer.updateConfig({ enabled: !sessionTimer.config.enabled })}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              sessionTimer.config.enabled ? "bg-success/15 text-success" : "bg-surface text-text-muted"
            }`}
          >
            {sessionTimer.config.enabled ? "on" : "off"}
          </button>
        </div>
        {sessionTimer.config.enabled && (
          <div className="flex items-center justify-between text-sm pl-1">
            <span className="text-text-muted">Remind after</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const cur = sessionTimer.config.intervalMinutes;
                  if (cur > 15) sessionTimer.updateConfig({ intervalMinutes: cur - 15 });
                }}
                className="text-xs text-text-muted hover:text-text px-1"
              >-</button>
              <span className="text-xs text-text-secondary w-12 text-center">{sessionTimer.config.intervalMinutes}m</span>
              <button
                onClick={() => {
                  const cur = sessionTimer.config.intervalMinutes;
                  sessionTimer.updateConfig({ intervalMinutes: cur + 15 });
                }}
                className="text-xs text-text-muted hover:text-text px-1"
              >+</button>
            </div>
          </div>
        )}
      </div>

      <span className="text-xs text-text-muted pt-2.5 border-t border-border">esc to close</span>
    </OverlayShell>
  );
}
