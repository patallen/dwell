import { useState, useEffect, useCallback } from "react";

export type PromptType = "water" | "movement" | "meal";

export interface BodyPromptConfig {
  enabled: boolean;
  intervals: Record<PromptType, number>; // minutes
  snoozeMinutes: number;
}

export interface ActivePrompt {
  type: PromptType;
  elapsed: number; // minutes since last acknowledgment
}

const DEFAULT_CONFIG: BodyPromptConfig = {
  enabled: true,
  intervals: { water: 45, movement: 60, meal: 240 },
  snoozeMinutes: 15,
};

const STORAGE_KEY = "adhdeez:bodyPrompts";
const TIMESTAMPS_KEY = "adhdeez:bodyPrompts:timestamps";

function loadConfig(): BodyPromptConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* use defaults */ }
  return DEFAULT_CONFIG;
}

function saveConfig(config: BodyPromptConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadTimestamps(): Record<PromptType, number> {
  try {
    const raw = localStorage.getItem(TIMESTAMPS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* use defaults */ }
  const now = Date.now();
  return { water: now, movement: now, meal: now };
}

function saveTimestamps(timestamps: Record<PromptType, number>) {
  localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(timestamps));
}

const PROMPT_LABELS: Record<PromptType, string> = {
  water: "Water?",
  movement: "Stretch?",
  meal: "Eaten recently?",
};

const PROMPT_TYPES: PromptType[] = ["water", "movement", "meal"];

export function useBodyPrompts() {
  const [config, setConfig] = useState<BodyPromptConfig>(loadConfig);
  const [timestamps, setTimestamps] = useState<Record<PromptType, number>>(loadTimestamps);
  const [activePrompts, setActivePrompts] = useState<ActivePrompt[]>([]);

  // Check for elapsed prompts every 30s
  useEffect(() => {
    if (!config.enabled) return;

    const check = () => {
      const now = Date.now();
      const overdue: ActivePrompt[] = [];

      for (const type of PROMPT_TYPES) {
        const elapsed = (now - timestamps[type]) / 60000;
        const interval = config.intervals[type];
        if (elapsed >= interval) {
          overdue.push({ type, elapsed: Math.floor(elapsed) });
        }
      }

      setActivePrompts(overdue);
    };

    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [config, timestamps]);

  // Derive active prompts as empty when disabled
  const effectivePrompts = config.enabled ? activePrompts : [];

  const acknowledge = useCallback((type: PromptType) => {
    const next = { ...timestamps, [type]: Date.now() };
    setTimestamps(next);
    saveTimestamps(next);
    setActivePrompts(prev => prev.filter(p => p.type !== type));
  }, [timestamps]);

  const snooze = useCallback((type: PromptType) => {
    // Push the timestamp forward so it fires again after snooze period
    const snoozeUntil = Date.now() - (config.intervals[type] - config.snoozeMinutes) * 60000;
    const next = { ...timestamps, [type]: snoozeUntil };
    setTimestamps(next);
    saveTimestamps(next);
    setActivePrompts(prev => prev.filter(p => p.type !== type));
  }, [timestamps, config]);

  const updateConfig = useCallback((updates: Partial<BodyPromptConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    saveConfig(next);
  }, [config]);

  return { config, activePrompts: effectivePrompts, PROMPT_LABELS, acknowledge, snooze, updateConfig };
}
