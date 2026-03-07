import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { OpenQuestion } from "../extensions/openQuestion";
import { useCallback, useEffect, useState, useRef } from "react";

interface EditorProps {
  content: string;
  onUpdate: (content: string) => void;
  onQuestion?: (text: string) => void;
  placeholder?: string;
}

export default function Editor({ content, onUpdate, onQuestion, placeholder }: EditorProps) {
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
      OpenQuestion,
    ],
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
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  const handleQuestion = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to);
    editor.chain().focus().toggleOpenQuestion().run();
    if (onQuestion && selectedText.trim()) {
      onQuestion(selectedText.trim());
    }
  }, [editor, onQuestion]);

  if (!editor) return null;

  return (
    <div className="relative">
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
    </div>
  );
}
