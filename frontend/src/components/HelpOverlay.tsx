import OverlayShell from "./OverlayShell";

const SHORTCUTS = [
  ["Quick capture", "⌘I"],
  ["Find", "⌘/"],
  ["Stack", "⌘J"],
  ["Notes", "⌘P"],
  ["Accept suggestion", "Enter / Y"],
  ["Skip suggestion", "N / Tab"],
  ["Done", "D"],
  ["Drop", "X"],
  ["Pause (put back)", "P"],
  ["Help", "⌘."],
  ["Settings", "⌘,"],
  ["Close / back", "Esc"],
];

export default function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayShell onClose={onClose}>
      <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">
        Keyboard Shortcuts
      </h3>
      <ul className="mb-2">
        {SHORTCUTS.map(([label, key]) => (
          <li key={key} className="flex items-center py-2 px-1 text-sm">
            <span className="text-text-secondary">{label}</span>
            <kbd className="ml-auto text-xs text-text-muted bg-background border border-border px-2 py-0.5 rounded-md font-[inherit]">
              {key}
            </kbd>
          </li>
        ))}
      </ul>
      <span className="text-xs text-text-muted pt-2.5 border-t border-border">esc to close</span>
    </OverlayShell>
  );
}
