import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { setContextMemo } from "./api";
import NoteRoute from "./components/NoteRoute";
import WhereWasI from "./components/WhereWasI";
import NoteToSelf from "./components/NoteToSelf";
import SoftLanding from "./components/SoftLanding";
import GentleWave from "./components/GentleWave";
import Workspace from "./components/Workspace";
import AppFooter from "./components/AppFooter";
import CaptureOverlay from "./components/CaptureOverlay";
import FindOverlay from "./components/FindOverlay";
import StackOverlay from "./components/StackOverlay";
import NotesOverlay from "./components/NotesOverlay";
import HelpOverlay from "./components/HelpOverlay";
import SettingsOverlay from "./components/SettingsOverlay";
import { useBodyPrompts } from "./hooks/useBodyPrompts";
import { useSessionTimer } from "./hooks/useSessionTimer";
import { useOverlay } from "./hooks/useOverlayManager";
import { useFocusManager } from "./hooks/useFocusManager";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
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
  const location = useLocation();
  const overlayState = useOverlay();
  const { overlay, close } = overlayState;

  const isNoteView = location.pathname.startsWith("/note/");

  useAppShortcuts(overlayState, focusManager, isNoteView);

  useEffect(() => {
    initSSE();
    return () => stopSSE();
  }, []);

  if (showLanding) {
    return <SoftLanding onSelect={handleLanding} />;
  }

  return (
    <div className="h-dvh flex flex-col bg-background font-sans text-text antialiased">
      {overlay === "capture" && <CaptureOverlay onClose={close} onCaptured={refresh} />}
      {overlay === "find" && <FindOverlay onClose={close} onAction={initiateAction} />}
      {overlay === "stack" && <StackOverlay onClose={close} onRefresh={refresh} />}
      {overlay === "notes" && <NotesOverlay onClose={close} />}
      {overlay === "help" && <HelpOverlay onClose={close} />}
      {overlay === "settings" && <SettingsOverlay onClose={close} bodyPrompts={bodyPrompts} sessionTimer={sessionTimer} />}

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

      {showWhereWasI && !pendingAction && focus?.state === "focused" && (
        <WhereWasI
          focus={focus}
          onDismiss={() => {
            setShowWhereWasI(false);
            void setContextMemo("");
          }}
        />
      )}

      <main className={`flex-1 flex ${isNoteView ? "items-start" : focus?.state === "empty" ? "items-center" : "items-start"} justify-center p-6 sm:p-10 overflow-y-auto`}>
        <Routes>
          <Route path="/note/:noteId" element={<NoteRoute />} />
          <Route path="*" element={<Workspace focusManager={focusManager} />} />
        </Routes>
      </main>

      {sessionTimer.showWave && !overlay && !pendingAction && (
        <GentleWave
          minutes={sessionTimer.sessionMinutes}
          onDismiss={sessionTimer.dismiss}
          onSnooze={sessionTimer.snooze}
        />
      )}

      <AppFooter
        focus={focus}
        activeThreadCount={activeThreadCount}
        bodyPrompts={bodyPrompts}
      />
    </div>
  );
}

export default App;
