interface OverlayShellProps {
  onClose: () => void;
  children: React.ReactNode;
}

export default function OverlayShell({ onClose, children }: OverlayShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(480px,calc(100vw-48px))] max-h-[60vh] flex flex-col bg-surface-raised border border-border rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
