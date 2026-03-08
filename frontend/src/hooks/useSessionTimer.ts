import { useState, useEffect, useCallback, useRef } from "react";

export interface SessionTimerConfig {
  enabled: boolean;
  intervalMinutes: number; // minutes of continuous interaction before wave
  snoozeMinutes: number;
}

const DEFAULT_CONFIG: SessionTimerConfig = {
  enabled: true,
  intervalMinutes: 90,
  snoozeMinutes: 30,
};

const STORAGE_KEY = "adhdeez:sessionTimer";
const IDLE_DECAY_MS = 5 * 60000; // 5 min of no input resets active time
const IDLE_THRESHOLD_MS = 2000; // 2s pause before showing wave (don't interrupt typing)
const AUTO_FADE_MS = 30000; // auto-dismiss after 30s
const TICK_MS = 5000; // check every 5s

function loadConfig(): SessionTimerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* use defaults */ }
  return DEFAULT_CONFIG;
}

function saveConfig(config: SessionTimerConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useSessionTimer() {
  const [config, setConfig] = useState<SessionTimerConfig>(loadConfig);
  const [showWave, setShowWave] = useState(false);
  const [activeMinutes, setActiveMinutes] = useState(0);

  // Tracks accumulated active interaction time in ms
  const activeTimeRef = useRef(0);
  // When the current active stretch started (last input event after an idle gap)
  const stretchStartRef = useRef(0);
  // Last input timestamp
  const lastInputRef = useRef(0);
  // Whether we're currently in an active stretch
  const inStretchRef = useRef(false);
  const snoozedUntilRef = useRef(0);
  const waveShownForRef = useRef(0); // activeTime threshold when last wave was shown
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Track user input — accumulate active time
  useEffect(() => {
    const onInput = () => {
      const now = Date.now();
      const gap = now - lastInputRef.current;

      if (!inStretchRef.current || gap >= IDLE_DECAY_MS) {
        // Starting a new stretch — either first input or back from idle
        // Bank any previous stretch time before the idle gap
        if (inStretchRef.current && lastInputRef.current > stretchStartRef.current) {
          activeTimeRef.current += lastInputRef.current - stretchStartRef.current;
        }
        // If gap was >= IDLE_DECAY, reset accumulated time (session broken)
        if (gap >= IDLE_DECAY_MS) {
          activeTimeRef.current = 0;
          waveShownForRef.current = 0;
        }
        stretchStartRef.current = now;
        inStretchRef.current = true;
      }

      lastInputRef.current = now;
    };

    const events = ["keydown", "mousedown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, onInput, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, onInput));
    };
  }, []);

  // Check every 5s if we should show the wave
  useEffect(() => {
    if (!config.enabled) return;

    const check = () => {
      const now = Date.now();

      // Calculate total active time: banked + current stretch
      let total = activeTimeRef.current;
      if (inStretchRef.current && lastInputRef.current > stretchStartRef.current) {
        const gap = now - lastInputRef.current;
        if (gap < IDLE_DECAY_MS) {
          // Still in active stretch
          total += now - stretchStartRef.current;
        } else {
          // Stretch ended due to idle decay — reset session
          inStretchRef.current = false;
          activeTimeRef.current = 0;
          waveShownForRef.current = 0;
          total = 0;
        }
      }

      const totalMinutes = total / 60000;
      setActiveMinutes(Math.floor(totalMinutes));

      // Not enough active time yet
      if (totalMinutes < config.intervalMinutes) return;

      // Snoozed
      if (now < snoozedUntilRef.current) return;

      // Already showing
      if (showWave) return;

      // Already shown a wave for this threshold
      const threshold = Math.floor(totalMinutes / config.intervalMinutes) * config.intervalMinutes;
      if (threshold <= waveShownForRef.current) return;

      // Wait for a natural pause
      const idleTime = now - lastInputRef.current;
      if (idleTime < IDLE_THRESHOLD_MS) return;

      waveShownForRef.current = threshold;
      setShowWave(true);
    };

    const id = setInterval(check, TICK_MS);
    return () => clearInterval(id);
  }, [config, showWave]);

  // Auto-fade after 30s
  useEffect(() => {
    if (!showWave) {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      return;
    }
    fadeTimerRef.current = setTimeout(() => {
      setShowWave(false);
    }, AUTO_FADE_MS);
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [showWave]);

  const dismiss = useCallback(() => {
    setShowWave(false);
  }, []);

  const snooze = useCallback(() => {
    setShowWave(false);
    snoozedUntilRef.current = Date.now() + config.snoozeMinutes * 60000;
  }, [config.snoozeMinutes]);

  const updateConfig = useCallback((updates: Partial<SessionTimerConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    saveConfig(next);
  }, [config]);

  return { config, showWave, sessionMinutes: activeMinutes, dismiss, snooze, updateConfig };
}
