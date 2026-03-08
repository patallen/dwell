import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { OpenQuestion } from "../extensions/openQuestion";
import { VimMode } from "../extensions/vimMode";
import type { VimMode as VimModeType, VimModeStorage } from "../extensions/vimMode";
import { useCallback, useEffect, useState, useRef } from "react";

export interface QuestionMenuAction {
  questionId: string;
  questionText: string;
  position: { top: number; left: number };
}

interface EditorProps {
  content: string;
  onUpdate: (content: string) => void;
  onQuestion?: (text: string) => Promise<string | void>;
  onQuestionAction?: (action: QuestionMenuAction) => void;
  placeholder?: string;
  vim?: boolean;
}

export default function Editor({ content, onUpdate, onQuestion, onQuestionAction, placeholder, vim = true }: EditorProps) {
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [vimMode, setVimMode] = useState<VimModeType>("normal");
  const toolbarRef = useRef<HTMLDivElement>(null);

  const vimModeRef = useRef<VimModeType>(vim ? "normal" : "insert");

  const extensions = [
    StarterKit,
    Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
    OpenQuestion,
    ...(vim ? [VimMode] : []),
  ];

  const editor = useEditor({
    autofocus: true,
    extensions,
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setToolbarPos(null);
        return;
      }
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const editorRect = view.dom.getBoundingClientRect();
      setToolbarPos({
        top: start.top - editorRect.top - 40,
        left: (start.left + end.right) / 2 - editorRect.left,
      });
    },
    editorProps: {
      attributes: {
        class: "tiptap outline-none min-h-[200px]",
      },
      handleClick: (view, pos) => {
        if (!onQuestionAction) return false;
        // Don't open question menu in vim normal mode — just navigate
        if (vimModeRef.current === "normal") return false;
        const resolved = view.state.doc.resolve(pos);
        const marks = resolved.marks();
        const questionMark = marks.find(m => m.type.name === "openQuestion");
        if (questionMark?.attrs.questionId) {
          const coords = view.coordsAtPos(pos);
          const editorRect = view.dom.getBoundingClientRect();
          onQuestionAction({
            questionId: questionMark.attrs.questionId,
            questionText: "",
            position: {
              top: coords.bottom - editorRect.top + 4,
              left: coords.left - editorRect.left,
            },
          });
          return true;
        }
        return false;
      },
    },
  });

  // Wire up vim mode change callback via ref to avoid hook immutability lint
  const vimCallbackRef = useRef<(mode: VimModeType) => void>(undefined);
  vimCallbackRef.current = (mode: VimModeType) => { vimModeRef.current = mode; setVimMode(mode); };

  useEffect(() => {
    if (!editor || !vim) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (editor.storage as any).vimMode as VimModeStorage | undefined;
    if (!storage) return;
    // Use a stable wrapper that delegates to the ref
    const wrapper = (mode: VimModeType) => vimCallbackRef.current?.(mode);
    // eslint-disable-next-line react-hooks/immutability
    storage.onModeChange = wrapper;
    return () => {
      if (storage.onModeChange === wrapper) storage.onModeChange = undefined;
    };
  }, [editor, vim]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleQuestion = useCallback(async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (!selectedText.trim()) return;

    if (editor.isActive("openQuestion")) {
      editor.chain().focus().toggleOpenQuestion().run();
      return;
    }

    if (onQuestion) {
      const questionId = await onQuestion(selectedText.trim());
      if (questionId) {
        editor.chain().focus().setOpenQuestion({ questionId }).run();
        return;
      }
    }
    editor.chain().focus().toggleOpenQuestion().run();
  }, [editor, onQuestion]);

  if (!editor) return null;

  return (
    <div className="relative">
      {/* Selection toolbar */}
      {toolbarPos && (
        <div
          ref={toolbarRef}
          className="absolute z-10 flex gap-1 bg-surface-raised border border-border rounded-xl px-2 py-1.5 shadow-xl"
          style={{ top: toolbarPos.top, left: toolbarPos.left, transform: "translateX(-50%)" }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
              editor.isActive("bold") ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text"
            }`}
          >
            B
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            className={`px-2 py-0.5 rounded text-xs italic transition-colors ${
              editor.isActive("italic") ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text"
            }`}
          >
            I
          </button>
          <div className="w-px bg-border-subtle mx-0.5" />
          <button
            onMouseDown={e => { e.preventDefault(); handleQuestion(); }}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              editor.isActive("openQuestion") ? "bg-warn/20 text-warn" : "text-text-muted hover:text-text"
            }`}
            title="Mark as open question"
          >
            ?
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      {/* Vim mode indicator */}
      {vim && (
        <div className={`mt-2 text-[10px] font-mono tracking-widest uppercase ${
          vimMode === "insert" ? "text-success" : "text-accent"
        }`}>
          -- {vimMode} --
        </div>
      )}
    </div>
  );
}
