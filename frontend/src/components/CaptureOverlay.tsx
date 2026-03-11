import { useState, useRef } from "react";
import { createTask } from "../api";
import OverlayShell from "./OverlayShell";

interface CaptureOverlayProps {
  onClose: () => void;
  onCaptured: () => void;
}

export default function CaptureOverlay({ onClose, onCaptured }: CaptureOverlayProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onClose();
    await createTask({ title: trimmed });
    onCaptured();
  };

  return (
    <OverlayShell onClose={onClose}>
      <input
        className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
        autoFocus
        placeholder="what's on your mind?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            void submit();
          }
        }}
        ref={ref}
      />
      <span className="text-xs text-text-muted pt-2.5 border-t border-border">
        enter to save · esc to cancel
      </span>
    </OverlayShell>
  );
}
