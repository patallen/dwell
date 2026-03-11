import { useEffect } from "react";
import type { FocusManager } from "./useFocusManager";
import type { OverlayState } from "./useOverlayManager";

export function useAppShortcuts(
  { overlay, setOverlay, close }: OverlayState,
  focusManager: FocusManager,
  isNoteView: boolean,
) {
  const { pendingAction, focus, handleDone, handleDrop, handlePause } = focusManager;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (overlay) { close(); return; }
        return;
      }
      if (overlay || pendingAction) return;

      if (meta && e.key === "i") { e.preventDefault(); setOverlay("capture"); return; }
      if (meta && e.key === "/") { e.preventDefault(); setOverlay("find"); return; }
      if (meta && e.key === "j") { e.preventDefault(); setOverlay("stack"); return; }
      if (meta && e.key === "p") { e.preventDefault(); setOverlay("notes"); return; }
      if (meta && e.key === ".") { e.preventDefault(); setOverlay("help"); return; }
      if (meta && e.key === ",") { e.preventDefault(); setOverlay("settings"); return; }

      if (!isNoteView && focus?.state === "focused" && focus.task) {
        if (e.key === "d") { e.preventDefault(); void handleDone(); return; }
        if (e.key === "x") { e.preventDefault(); void handleDrop(); return; }
        if (e.key === "p") { e.preventDefault(); void handlePause(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlay, setOverlay, close, pendingAction, focus, isNoteView, handleDone, handleDrop, handlePause]);
}
