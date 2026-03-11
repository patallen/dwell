import { useNavigate } from "react-router-dom";
import type { FocusState } from "../api";
import type { useBodyPrompts } from "../hooks/useBodyPrompts";
import AmbientPulse from "./AmbientPulse";

interface AppFooterProps {
  focus: FocusState | null;
  activeThreadCount: number;
  bodyPrompts: ReturnType<typeof useBodyPrompts>;
}

export default function AppFooter({ focus, activeThreadCount, bodyPrompts }: AppFooterProps) {
  const navigate = useNavigate();

  return (
    <footer className="sticky bottom-0 z-40 px-6 py-2.5 border-t border-border-subtle flex flex-wrap items-center gap-4 text-xs text-text-muted shrink-0 sm:px-10 bg-background/80 backdrop-blur-md">
      {focus?.state === "focused" && (
        <span
          className="text-text-secondary truncate max-w-[200px] cursor-pointer hover:text-text transition-colors"
          onClick={() => {
            if (focus.context?.type === "note" && focus.note) {
              navigate(`/note/${focus.note.id}`);
            } else {
              navigate("/");
            }
          }}
        >
          {focus.task?.title || focus.note?.title}
        </span>
      )}
      {focus?.state === "focused" && focus.stack_depth && focus.stack_depth > 1 && (
        <span>{focus.stack_depth - 1} paused</span>
      )}
      {activeThreadCount > 0 && (
        <span className="text-accent animate-pulse">
          {activeThreadCount} AI active
        </span>
      )}
      <span className="ml-auto" />
      <span>⌘I capture</span>
      <span>⌘/ find</span>
      <span>⌘J stack</span>
      <span>⌘P notes</span>
      <span>⌘. help</span>
      {bodyPrompts.activePrompts.length > 0 && (
        <div className="ml-auto flex items-center gap-4">
          {bodyPrompts.activePrompts.map(prompt => (
            <AmbientPulse
              key={prompt.type}
              prompt={prompt}
              label={bodyPrompts.PROMPT_LABELS[prompt.type]}
              onAcknowledge={bodyPrompts.acknowledge}
              onSnooze={bodyPrompts.snooze}
            />
          ))}
        </div>
      )}
    </footer>
  );
}
