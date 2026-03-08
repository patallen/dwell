interface GentleWaveProps {
  minutes: number;
  onDismiss: () => void;
  onSnooze: () => void;
}

export default function GentleWave({ minutes, onDismiss, onSnooze }: GentleWaveProps) {
  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-30 animate-in">
      <div className="bg-surface-raised border border-border rounded-2xl px-5 py-3 shadow-xl flex items-center gap-4 max-w-md">
        <span className="text-sm text-text-secondary">
          Been at it for {minutes} min. Water? Stretch? You're doing great.
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDismiss}
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            ok
          </button>
          <button
            onClick={onSnooze}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            later
          </button>
        </div>
      </div>
    </div>
  );
}
