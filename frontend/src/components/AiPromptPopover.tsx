import { useState, useEffect, useRef, useCallback } from "react";

interface AiPromptPopoverProps {
  position: { top: number; left: number };
  selectionText: string;
  onSubmit: (action: "elaborate" | "research", prompt: string) => void;
  onDismiss: () => void;
}

const DEFAULT_PROMPTS = {
  elaborate:
    "Expand on this idea, developing it further. Write naturally, matching the tone and style of the surrounding text. Be concise.",
  research:
    "Research this topic. Provide factual, well-sourced information. Be concise and direct.",
};

export default function AiPromptPopover({
  position,
  selectionText,
  onSubmit,
  onDismiss,
}: AiPromptPopoverProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();

      // Enter → elaborate, Shift+Enter → research
      if (e.key === "Enter") {
        e.preventDefault();
        // Without selection, require a typed prompt
        if (!selectionText && !input.trim()) return;
        if (e.shiftKey) {
          onSubmit("research", input.trim() || DEFAULT_PROMPTS.research);
        } else {
          onSubmit("elaborate", input.trim() || DEFAULT_PROMPTS.elaborate);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [input, selectionText, onSubmit, onDismiss],
  );

  return (
    <div
      className="absolute z-20 w-[280px] bg-surface-raised border border-border rounded-xl shadow-xl p-2.5"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {selectionText ? (
        <div className="text-[10px] text-text-muted truncate mb-1.5">
          &quot;{selectionText.slice(0, 60)}
          {selectionText.length > 60 ? "..." : ""}&quot;
        </div>
      ) : (
        <div className="text-[10px] text-text-muted mb-1.5">at cursor</div>
      )}

      {selectionText && (
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => onSubmit("elaborate", DEFAULT_PROMPTS.elaborate)}
            className="flex-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
          >
            elaborate <span className="opacity-40 ml-0.5">&#9166;</span>
          </button>
          <button
            onClick={() => onSubmit("research", DEFAULT_PROMPTS.research)}
            className="flex-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-warn/15 text-warn hover:bg-warn/25 transition-colors"
          >
            research <span className="opacity-40 ml-0.5">&#8679;&#9166;</span>
          </button>
        </div>
      )}

      {selectionText && <div className="border-t border-border-subtle mb-2" />}

      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-sm bg-transparent border-none outline-none text-text placeholder:text-text-muted/50 py-0.5"
        placeholder={selectionText ? "or type a custom prompt..." : "what should AI do here?"}
      />
    </div>
  );
}
