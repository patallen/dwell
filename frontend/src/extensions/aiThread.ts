import { Mark, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface AiThreadStorage {
  onAiTrigger?: (ctx: {
    from: number;
    to: number;
    text: string;
    cursorContext: string;
  }) => void;
}

const aiPinKey = new PluginKey("aiThreadPins");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiThreadManager: {
      setAiThreadMark: (threadId: string) => ReturnType;
      removeAiThreadMark: (threadId: string) => ReturnType;
      addAiThreadPin: (threadId: string, pos: number) => ReturnType;
      removeAiThreadPin: (threadId: string) => ReturnType;
    };
  }
}

const AiThreadMark = Mark.create({
  name: "aiThread",
  inclusive: false,
  spanning: true,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ai-thread-id"),
        renderHTML: (attributes) => {
          if (!attributes.threadId) return {};
          return { "data-ai-thread-id": attributes.threadId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-ai-thread-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "ai-thread-highlight" }),
      0,
    ];
  },
});

const AiThreadExt = Extension.create<object, AiThreadStorage>({
  name: "aiThreadManager",

  addStorage() {
    return {};
  },

  addExtensions() {
    return [AiThreadMark];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: aiPinKey,
        state: {
          init() {
            return { pins: new Map<string, number>() };
          },
          apply(tr, value) {
            const meta = tr.getMeta(aiPinKey) as
              | { action: "add"; threadId: string; pos: number }
              | { action: "remove"; threadId: string }
              | undefined;
            if (meta) {
              const pins = new Map(value.pins);
              if (meta.action === "add") {
                pins.set(meta.threadId, meta.pos);
              } else if (meta.action === "remove") {
                pins.delete(meta.threadId);
              }
              return { pins };
            }
            // Map positions through document changes
            if (tr.docChanged) {
              const pins = new Map<string, number>();
              for (const [id, pos] of value.pins) {
                const mapped = tr.mapping.map(pos);
                pins.set(id, mapped);
              }
              return { pins };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = aiPinKey.getState(state) as { pins: Map<string, number> } | undefined;
            if (!pluginState || pluginState.pins.size === 0) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            for (const [threadId, pos] of pluginState.pins) {
              const clampedPos = Math.min(pos, state.doc.content.size);
              const widget = document.createElement("span");
              widget.className = "ai-thread-pin";
              widget.dataset.aiThreadId = threadId;
              widget.textContent = "▎";
              decorations.push(Decoration.widget(clampedPos, widget, { side: 0 }));
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setAiThreadMark:
        (threadId: string) =>
        ({ commands }) => {
          return commands.setMark("aiThread", { threadId });
        },
      removeAiThreadMark:
        (threadId: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          const { doc } = tr;
          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (
                mark.type.name === "aiThread" &&
                mark.attrs.threadId === threadId
              ) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            });
          });
          dispatch(tr);
          return true;
        },
      addAiThreadPin:
        (threadId: string, pos: number) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(aiPinKey, { action: "add", threadId, pos });
          dispatch(tr);
          return true;
        },
      removeAiThreadPin:
        (threadId: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(aiPinKey, { action: "remove", threadId });
          dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-l": () => {
        const { from, to } = this.editor.state.selection;
        const doc = this.editor.state.doc;
        const start = Math.max(0, from - 200);
        const end = Math.min(doc.content.size, from + 200);
        const cursorContext = doc.textBetween(start, end, "\n");
        const text = from !== to ? doc.textBetween(from, to) : "";

        const storage = this.storage as AiThreadStorage;
        if (storage.onAiTrigger) {
          storage.onAiTrigger({ from, to, text, cursorContext });
        }

        return true;
      },
    };
  },
});

export default AiThreadExt;
