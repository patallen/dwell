import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  setContextMemo,
} from "./api";
import NoteRoute from "./components/NoteRoute";
import WhereWasI from "./components/WhereWasI";
import NoteToSelf from "./components/NoteToSelf";
import SoftLanding from "./components/SoftLanding";
import GentleWave from "./components/GentleWave";
import Workspace from "./components/Workspace";
import AppFooter from "./components/AppFooter";
import { useBodyPrompts } from "./hooks/useBodyPrompts";
import { useSessionTimer } from "./hooks/useSessionTimer";
import { useOverlayManager } from "./hooks/useOverlayManager";
import { useFocusManager } from "./hooks/useFocusManager";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import AppOverlays from "./components/AppOverlays";
import { initSSE, stopSSE } from "./sse";
import { useActiveThreadCount } from "./store";

function App() {
  const focusManager = useFocusManager();
  const {
    showLanding,
    focus,
    showWhereWasI,
    pendingAction,
    refresh,
    executeAction,
    initiateAction,
    handleLanding,
    setPendingAction,
    setShowWhereWasI,
  } = focusManager;
  
  const bodyPrompts = useBodyPrompts();
  const sessionTimer = useSessionTimer();
  const activeThreadCount = useActiveThreadCount();
  const navigate = useNavigate();
  const location = useLocation();

  const isNoteView = location.pathname.startsWith("/note/");

  const overlayManager = useOverlayManager(refresh, initiateAction);
  useAppShortcuts(overlayManager, focusManager, isNoteView);

  // Init SSE — onopen re-seeds store with notes
  useEffect(() => {
    initSSE();
    return () => stopSSE();
  }, []);

  if (showLanding) {
    return <SoftLanding onSelect={handleLanding} />;
  }

  return (
    <div className="h-dvh flex flex-col bg-background font-sans text-text antialiased">
      <AppOverlays
        overlayManager={overlayManager}
        bodyPrompts={bodyPrompts}
        sessionTimer={sessionTimer}
      />

      {/* Note to self prompt */}
      {pendingAction && (
        <NoteToSelf
          taskTitle={focus?.task?.title || focus?.note?.title || "current task"}
          onSubmit={(memo) => {
            setPendingAction(null);
            void executeAction(pendingAction, memo);
          }}
          onSkip={() => {
            setPendingAction(null);
            void executeAction(pendingAction);
          }}
        />
      )}

      {/* Where Was I restoration card */}
      {showWhereWasI && !pendingAction && focus?.state === "focused" && (
        <WhereWasI
          focus={focus}
          onDismiss={() => {
            setShowWhereWasI(false);
            void setContextMemo("");
          }}
        />
      )}

      {/* Main */}
      <main className={`flex-1 flex ${isNoteView ? "items-start" : focus?.state === "empty" ? "items-center" : "items-start"} justify-center p-6 sm:p-10 overflow-y-auto`}>
        <Routes>
          <Route path="/note/:noteId" element={<NoteRoute />} />
          <Route path="*" element={<Workspace focusManager={focusManager} />} />
        </Routes>
      </main>

      {/* Session guardrail */}
      {sessionTimer.showWave && !overlayManager.overlay && !pendingAction && (
        <GentleWave
          minutes={sessionTimer.sessionMinutes}
          onDismiss={sessionTimer.dismiss}
          onSnooze={sessionTimer.snooze}
        />
      )}

      {/* Footer */}
      <AppFooter
        focus={focus}
        activeThreadCount={activeThreadCount}
        bodyPrompts={bodyPrompts}
      />
    </div>
  );
}

export default App;
