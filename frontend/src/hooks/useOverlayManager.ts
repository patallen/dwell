import { useState } from "react";

export type Overlay = null | "capture" | "find" | "stack" | "notes" | "help" | "settings";

export function useOverlay() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = () => setOverlay(null);
  return { overlay, setOverlay, close };
}

export type OverlayState = ReturnType<typeof useOverlay>;
