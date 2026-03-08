import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type VimMode = "normal" | "insert";

export interface VimModeStorage {
  mode: VimMode;
  onModeChange?: (mode: VimMode) => void;
}

const vimPluginKey = new PluginKey("vim");

export const VimMode = Extension.create<object, VimModeStorage>({
  name: "vimMode",

  addStorage() {
    return {
      mode: "normal" as VimMode,
      onModeChange: undefined,
    };
  },

  onCreate() {
    this.editor.view.dom.classList.add("vim-normal");
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;
    let pending: string | null = null;

    const setMode = (mode: VimMode) => {
      storage.mode = mode;
      storage.onModeChange?.(mode);
      editor.view.dom.classList.toggle("vim-normal", mode === "normal");
      editor.view.dom.classList.toggle("vim-insert", mode === "insert");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moveTo = (doc: any, view: any, pos: number, bias: number = 1) => {
      const clamped = Math.max(0, Math.min(doc.content.size, pos));
      try {
        const $pos = doc.resolve(clamped);
        let sel: InstanceType<typeof TextSelection>;
        if (!$pos.parent.isTextblock) {
          sel = TextSelection.near($pos, bias) as TextSelection;
        } else {
          sel = TextSelection.create(doc, clamped);
        }
        view.dispatch(view.state.tr.setSelection(sel));
      } catch {
        // Invalid position, ignore
      }
    };

    return [
      new Plugin({
        key: vimPluginKey,
        // Clamp cursor in normal mode: always on a character, never past end or between blocks
        appendTransaction(_trs, _oldState, newState) {
          if (storage.mode !== "normal") return null;
          const { from, to } = newState.selection;
          if (from !== to) return null;
          const $from = newState.doc.resolve(from);

          // If between blocks, resolve to nearest text position
          if (!$from.parent.isTextblock) {
            const sel = TextSelection.near($from) as TextSelection;
            return newState.tr.setSelection(sel);
          }

          // Clamp to last char of text block (vim behavior: cursor is always ON a char)
          const nodeEnd = $from.end($from.depth);
          const nodeStart = $from.start($from.depth);
          if (from === nodeEnd && nodeStart < nodeEnd) {
            return newState.tr.setSelection(
              TextSelection.create(newState.doc, nodeEnd - 1)
            );
          }
          return null;
        },
        props: {
          decorations(state) {
            if (storage.mode !== "normal") return DecorationSet.empty;
            const { from } = state.selection;
            const $from = state.doc.resolve(from);
            const nodeEnd = $from.end($from.depth);

            // Character under cursor — inline highlight
            if (from < nodeEnd) {
              try {
                return DecorationSet.create(state.doc, [
                  Decoration.inline(from, from + 1, { class: "vim-block-cursor" }),
                ]);
              } catch {
                // fall through to widget
              }
            }

            // Empty line — widget cursor
            const cursorEl = document.createElement("span");
            cursorEl.className = "vim-block-cursor vim-block-cursor-widget";
            cursorEl.textContent = "\u00a0";
            return DecorationSet.create(state.doc, [
              Decoration.widget(from, cursorEl),
            ]);
          },
          handleTextInput() {
            return storage.mode === "normal";
          },
          handlePaste() {
            return storage.mode === "normal";
          },
          handleDrop() {
            return storage.mode === "normal";
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handleKeyDown(view: any, event: KeyboardEvent) {
            // Let meta/ctrl combos pass through (except Ctrl+R for redo)
            if (event.metaKey || event.ctrlKey) {
              if (storage.mode === "normal" && event.ctrlKey && event.key === "r") {
                event.preventDefault();
                editor.commands.redo();
                return true;
              }
              return false;
            }

            // INSERT MODE — only intercept Escape
            if (storage.mode === "insert") {
              if (event.key === "Escape") {
                setMode("normal");
                // Move cursor back one char (vim convention)
                const { from } = view.state.selection;
                if (from > 1) {
                  moveTo(view.state.doc, view, from - 1);
                }
                return true;
              }
              return false;
            }

            // NORMAL MODE
            const { state } = view;
            const { doc, selection } = state;
            const { from } = selection;

            const $from = doc.resolve(from);

            // Clear pending if non-matching key
            const key = event.key;
            if (pending && key !== pending) {
              pending = null;
            }

            switch (key) {
              // --- Movement ---
              case "h":
                moveTo(doc, view, from - 1);
                return true;

              case "l":
                moveTo(doc, view, from + 1);
                return true;

              case "j": {
                // Try coordinate-based first (handles wrapped lines within a block)
                const coords = view.coordsAtPos(from);
                const below = view.posAtCoords({ left: coords.left, top: coords.bottom + 2 });
                if (below && below.pos !== from) {
                  moveTo(doc, view, below.pos);
                } else {
                  // Coordinate approach failed — walk past current textblock via document structure
                  // Go after the innermost block container (handles list items, headings, etc.)
                  const afterBlock = $from.after($from.depth);
                  if (afterBlock < doc.content.size) {
                    moveTo(doc, view, afterBlock, 1);
                  }
                }
                return true;
              }

              case "k": {
                const coords = view.coordsAtPos(from);
                const above = view.posAtCoords({ left: coords.left, top: coords.top - 2 });
                if (above && above.pos !== from) {
                  moveTo(doc, view, above.pos, -1);
                } else {
                  // Walk before current textblock, bias backward to find previous text
                  const beforeBlock = $from.before($from.depth);
                  if (beforeBlock > 0) {
                    moveTo(doc, view, beforeBlock - 1, -1);
                  }
                }
                return true;
              }

              case "w": {
                // Next word boundary — scoped to current textblock
                const wEnd = $from.end($from.depth);
                const textAfter = doc.textBetween(from, wEnd, "\0", "\0");
                const wm = textAfter.match(/^.?\S*\s+/);
                if (wm) {
                  moveTo(doc, view, from + wm[0].length);
                } else {
                  // Last word on line or at end — jump to start of next textblock
                  const afterBlock = $from.after($from.depth);
                  if (afterBlock < doc.content.size) {
                    moveTo(doc, view, afterBlock, 1);
                  }
                }
                return true;
              }

              case "b": {
                // Previous word boundary — scoped to current textblock
                const bStart = $from.start($from.depth);
                const textBefore = doc.textBetween(bStart, from, "\0", "\0");
                const bm = textBefore.match(/\s(\S+)$/);
                if (bm) {
                  moveTo(doc, view, from - bm[1].length);
                } else if (from > bStart) {
                  moveTo(doc, view, bStart);
                } else {
                  // At start of node — jump to previous textblock
                  moveTo(doc, view, bStart - 1, -1);
                }
                return true;
              }

              case "e": {
                // End of word — scoped to current textblock
                const eEnd = $from.end($from.depth);
                const textAfterE = doc.textBetween(from, eEnd, "\0", "\0");
                const em = textAfterE.match(/^.?\s*\S+/);
                if (em) {
                  moveTo(doc, view, from + em[0].length - 1);
                } else if (from < eEnd - 1) {
                  moveTo(doc, view, eEnd - 1);
                } else {
                  moveTo(doc, view, eEnd + 1, 1);
                }
                return true;
              }

              case "0": {
                // Start of line (start of current node)
                moveTo(doc, view, $from.start($from.depth));
                return true;
              }

              case "$": {
                // End of line (end of current node)
                const end = $from.end($from.depth);
                moveTo(doc, view, Math.max(end - 1, $from.start($from.depth)));
                return true;
              }

              case "}": {
                // Next paragraph — jump to start of next top-level block
                // Walk up to depth 1 (top-level block), then go after it
                const topDepth = Math.min($from.depth, 1);
                const afterTop = $from.after(topDepth);
                if (afterTop < doc.content.size) {
                  moveTo(doc, view, afterTop, 1);
                }
                return true;
              }

              case "{": {
                // Previous paragraph — jump to start of previous top-level block
                const topDepth = Math.min($from.depth, 1);
                const beforeTop = $from.before(topDepth);
                if (beforeTop > 0) {
                  // Go to position before this block, then resolve forward into the previous block's start
                  const $prev = doc.resolve(beforeTop - 1);
                  const prevStart = $prev.start(Math.min($prev.depth, 1));
                  moveTo(doc, view, prevStart, 1);
                } else {
                  moveTo(doc, view, 1);
                }
                return true;
              }

              // --- gg / G ---
              case "g": {
                if (pending === "g") {
                  // gg — go to start of document
                  moveTo(doc, view, 1);
                  pending = null;
                } else {
                  pending = "g";
                }
                return true;
              }

              case "G": {
                // End of document
                moveTo(doc, view, doc.content.size - 1);
                return true;
              }

              // --- Insert mode transitions ---
              case "i":
                setMode("insert");
                return true;

              case "a": {
                // "after" — enter insert mode one position ahead
                // Must set mode BEFORE moving so appendTransaction doesn't clamp
                setMode("insert");
                const aPos = Math.min(from + 1, $from.end($from.depth));
                view.dispatch(state.tr.setSelection(TextSelection.create(doc, aPos)));
                return true;
              }

              case "I": {
                moveTo(doc, view, $from.start($from.depth));
                setMode("insert");
                return true;
              }

              case "A": {
                setMode("insert");
                view.dispatch(state.tr.setSelection(TextSelection.create(doc, $from.end($from.depth))));
                return true;
              }

              case "o": {
                // New line below
                const endOfNode = $from.end($from.depth);
                view.dispatch(state.tr.setSelection(TextSelection.create(doc, endOfNode)));
                editor.commands.splitBlock();
                setMode("insert");
                return true;
              }

              case "O": {
                // New line above
                const startOfNode = $from.start($from.depth);
                const before = $from.before($from.depth);
                const schema = doc.type.schema;
                const newParagraph = schema.nodes.paragraph.create();
                const tr = state.tr.insert(before, newParagraph);
                view.dispatch(tr.setSelection(TextSelection.create(tr.doc, startOfNode)));
                setMode("insert");
                return true;
              }

              // --- Editing ---
              case "x": {
                // Delete char under cursor
                const endPos = Math.min(from + 1, doc.content.size - 1);
                if (from < endPos) {
                  view.dispatch(state.tr.delete(from, endPos));
                }
                return true;
              }

              case "d": {
                if (pending === "d") {
                  // dd — delete current line (paragraph)
                  const nodeStart = $from.before($from.depth);
                  const nodeEnd = $from.after($from.depth);
                  const tr = state.tr.delete(nodeStart, nodeEnd);
                  view.dispatch(tr);
                  pending = null;
                } else {
                  pending = "d";
                }
                return true;
              }

              case "D": {
                // Delete from cursor to end of line
                const end = $from.end($from.depth);
                if (from < end) {
                  view.dispatch(state.tr.delete(from, end));
                }
                return true;
              }

              case "C": {
                // Change from cursor to end of line
                const end = $from.end($from.depth);
                if (from < end) {
                  view.dispatch(state.tr.delete(from, end));
                }
                setMode("insert");
                return true;
              }

              case "c": {
                if (pending === "c") {
                  // cc — change entire line
                  const nodeStart = $from.start($from.depth);
                  const nodeEnd = $from.end($from.depth);
                  if (nodeStart < nodeEnd) {
                    view.dispatch(state.tr.delete(nodeStart, nodeEnd));
                  }
                  moveTo(view.state.doc, view, $from.start($from.depth));
                  setMode("insert");
                  pending = null;
                } else {
                  pending = "c";
                }
                return true;
              }

              // --- Undo ---
              case "u":
                editor.commands.undo();
                return true;

              // --- Misc ---
              case "Escape":
                return true;

              default:
                // Consume all other keys in normal mode to prevent typing
                return true;
            }
          },
        },
      }),
    ];
  },
});
