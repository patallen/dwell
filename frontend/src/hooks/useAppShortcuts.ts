import { useEffect } from "react";
import type { FocusManager } from "./useFocusManager";
import type { useOverlayManager } from "./useOverlayManager";

export function useAppShortcuts(
  overlayManager: ReturnType<typeof useOverlayManager>,
  focusManager: FocusManager,
  isNoteView: boolean
) {
  const { pendingAction, focus, handleDone, handleDrop, handlePause } = focusManager;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (overlayManager.overlay) {
          overlayManager.setOverlay(null);
          overlayManager.setCaptureText("");
          overlayManager.setFindText("");
          overlayManager.setFindResults([]);
          return;
        }
        return;
      }
      if (overlayManager.overlay || pendingAction) return;

      if (meta && e.key === "i") { e.preventDefault(); overlayManager.setCaptureText(""); overlayManager.setOverlay("capture"); return; }
      if (meta && e.key === "/") { e.preventDefault(); overlayManager.setFindText(""); overlayManager.setFindResults([]); overlayManager.setOverlay("find"); return; }
      if (meta && e.key === "j") { e.preventDefault(); void overlayManager.loadStack(); overlayManager.setOverlay("stack"); return; }
      if (meta && e.key === "p") { e.preventDefault(); void overlayManager.loadNotes(); overlayManager.setOverlay("notes"); return; }
      if (meta && e.key === ".") { e.preventDefault(); overlayManager.setOverlay("help"); return; }
      if (meta && e.key === ",") { e.preventDefault(); overlayManager.setOverlay("settings"); return; }

      if (!isNoteView && focus?.state === "focused" && focus.task) {
        if (e.key === "d") { e.preventDefault(); void handleDone(); return; }
        if (e.key === "x") { e.preventDefault(); void handleDrop(); return; }
        if (e.key === "p") { e.preventDefault(); void handlePause(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlayManager, pendingAction, focus, isNoteView, handleDone, handleDrop, handlePause]);
}
