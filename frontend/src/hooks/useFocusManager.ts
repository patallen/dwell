import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Task, Note, FocusState, EnergyLevel, PendingAction } from "../api";
import {
  fetchFocus,
  updateTask,
  pushContext,
  popContext,
  setContextMemo,
} from "../api";
import { store } from "../store";

export const LAST_SEEN_KEY = "dwell:lastSeen";
export const COLD_START_HOURS = 4;

export function isColdStart(): boolean {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return true;
    const elapsed = (Date.now() - Number(raw)) / 3600000;
    return elapsed >= COLD_START_HOURS;
  } catch {
    return true;
  }
}

export interface FocusManager {
  showLanding: boolean;
  energy: EnergyLevel | null;
  focus: FocusState | null;
  showWhereWasI: boolean;
  pendingAction: PendingAction | null;
  setShowLanding: (show: boolean) => void;
  setEnergy: (energy: EnergyLevel | null) => void;
  setFocus: (focus: FocusState | null) => void;
  setShowWhereWasI: (show: boolean) => void;
  setPendingAction: (action: PendingAction | null) => void;
  applyFocus: (state: FocusState) => void;
  refresh: () => Promise<void>;
  executeAction: (action: PendingAction, memo?: string) => Promise<void>;
  initiateAction: (action: PendingAction) => void;
  handleLanding: (selected: EnergyLevel) => void;
  handlePick: (suggestion: { type: "task" | "note"; task?: Task; note?: Note; reason: string }) => void;
  handleDone: () => void;
  handlePause: () => void;
  handleDrop: () => void;
}

export function useFocusManager(): FocusManager {
  const [showLanding, setShowLanding] = useState(isColdStart);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [showWhereWasI, setShowWhereWasI] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const applyFocus = useCallback((state: FocusState) => {
    setFocus(state);
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }, []);

  useEffect(() => {
    if (showLanding) return;
    fetchFocus(energy ?? undefined).then(applyFocus).catch(() => {});
  }, [applyFocus, energy, location.pathname, showLanding]);

  const refresh = useCallback(async () => {
    try {
      const state = await fetchFocus(energy ?? undefined);
      applyFocus(state);
    } catch (err) {
      console.error("Failed to refresh focus:", err);
    }
  }, [applyFocus, energy]);

  useEffect(() => {
    return store.subscribeFocus(() => {
      void refresh();
    });
  }, [refresh]);

  const executeAction = useCallback(async (action: PendingAction, memo?: string) => {
    let showRestore = false;

    try {
      if (action.type === "push") {
        const result = await pushContext(action.refId, action.refType, action.reason, memo);
        if (result.state === "focused" && result.context?.memo) {
          showRestore = true;
        }
      } else if (action.type === "pause") {
        const result = await popContext();
        if (result.state === "focused") {
          showRestore = true;
        }
      } else if (action.type === "done") {
        if (focus?.task) {
          await updateTask(focus.task.id, { status: "done" });
          if (focus.state === "focused") {
            const result = await popContext();
            if (result.state === "focused") {
              showRestore = true;
            }
          }
        }
      } else if (action.type === "drop") {
        if (focus?.task) {
          await updateTask(focus.task.id, { status: "dropped" });
          if (focus.state === "focused") {
            const result = await popContext();
            if (result.state === "focused") {
              showRestore = true;
            }
          }
        }
      }
    } catch (err) {
      console.error("Action failed:", err);
      // In a real app, we might show a toast here
    } finally {
      await refresh();
      if (showRestore) {
        setShowWhereWasI(true);
      }
    }
  }, [focus, refresh]);

  const initiateAction = useCallback((action: PendingAction) => {
    if (showWhereWasI) {
      setShowWhereWasI(false);
      void setContextMemo("");
    }
    if (action.type === "push" && focus?.state === "focused" && (focus.task || focus.note)) {
      setPendingAction(action);
    } else {
      void executeAction(action);
    }
  }, [focus, executeAction, showWhereWasI]);

  const handleLanding = useCallback((selected: EnergyLevel) => {
    setEnergy(selected);
    setShowLanding(false);
  }, []);

  const handlePick = useCallback((suggestion: { type: "task" | "note"; task?: Task; note?: Note; reason: string }) => {
    if (suggestion.type === "note" && suggestion.note) {
      navigate(`/note/${suggestion.note.id}`);
      initiateAction({ type: "push", refId: suggestion.note.id, refType: "note", reason: suggestion.reason });
    } else if (suggestion.task) {
      initiateAction({ type: "push", refId: suggestion.task.id, refType: "task", reason: suggestion.reason });
    }
  }, [navigate, initiateAction]);

  const handleDone = useCallback(() => {
    if (!focus?.task) return;
    initiateAction({ type: "done" });
  }, [focus, initiateAction]);

  const handlePause = useCallback(() => {
    if (focus?.state !== "focused") return;
    initiateAction({ type: "pause" });
  }, [focus, initiateAction]);

  const handleDrop = useCallback(() => {
    if (!focus?.task) return;
    initiateAction({ type: "drop" });
  }, [focus, initiateAction]);

  return {
    showLanding,
    energy,
    focus,
    showWhereWasI,
    pendingAction,
    setShowLanding,
    setEnergy,
    setFocus,
    setShowWhereWasI,
    setPendingAction,
    applyFocus,
    refresh,
    executeAction,
    initiateAction,
    handleLanding,
    handlePick,
    handleDone,
    handlePause,
    handleDrop,
  };
}
