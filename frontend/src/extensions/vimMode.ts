import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type VimMode = "normal" | "insert" | "visual";

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
    let visualAnchor: number = 0;
    let visualHead: number = 0;

    const setMode = (mode: VimMode) => {
      storage.mode = mode;
      storage.onModeChange?.(mode);
      editor.view.dom.classList.toggle("vim-normal", mode === "normal" || mode === "visual");
      editor.view.dom.classList.toggle("vim-insert", mode === "insert");
      editor.view.dom.classList.toggle("vim-visual", mode === "visual");
    };

    const VIM_TX = "vimCommand";

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

    // Move the visual cursor head to a new position, keeping anchor fixed.
    // ProseMirror selection stays collapsed at head — range is rendered via decorations only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visualMoveTo = (doc: any, view: any, pos: number, bias: number = 1) => {
      const clamped = Math.max(0, Math.min(doc.content.size, pos));
      try {
        const $pos = doc.resolve(clamped);
        let resolved: number;
        if (!$pos.parent.isTextblock) {
          const near = TextSelection.near($pos, bias) as TextSelection;
          resolved = near.from;
        } else {
          resolved = clamped;
        }
        visualHead = resolved;
        // Keep ProseMirror selection collapsed at the head
        const sel = TextSelection.create(doc, resolved);
        view.dispatch(view.state.tr.setSelection(sel).setMeta(VIM_TX, true));
      } catch {
        // Invalid position, ignore
      }
    };

    // Dispatch a transaction marked as vim-originated (bypasses clamping)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vimDispatch = (view: any, tr: any) => {
      view.dispatch(tr.setMeta(VIM_TX, true));
    };

    return [
      new Plugin({
        key: vimPluginKey,
        // Clamp cursor in normal mode — only for external events (mouse clicks),
        // not for vim commands (which mark their transactions with VIM_TX)
        appendTransaction(trs, _oldState, newState) {
          if (storage.mode === "insert" || storage.mode === "visual") return null;
          if (trs.some((tr: { getMeta: (key: string) => unknown }) => tr.getMeta(VIM_TX))) return null;
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
            if (storage.mode !== "normal" && storage.mode !== "visual") return DecorationSet.empty;

            const cursorPos = storage.mode === "visual"
              ? visualHead
              : state.selection.from;
            const $cur = state.doc.resolve(cursorPos);
            const nodeEnd = $cur.end($cur.depth);

            const decos: Decoration[] = [];

            // Visual selection highlight (rendered via decoration, no native selection)
            if (storage.mode === "visual") {
              const sf = Math.min(visualAnchor, visualHead);
              const st = Math.max(visualAnchor, visualHead) + 1;
              const clampedSt = Math.min(st, state.doc.content.size);
              if (sf < clampedSt) {
                try {
                  decos.push(Decoration.inline(sf, clampedSt, { class: "vim-visual-range" }));
                } catch { /* ignore */ }
              }
            }

            // Character under cursor — inline highlight
            if (cursorPos < nodeEnd) {
              try {
                decos.push(Decoration.inline(cursorPos, cursorPos + 1, { class: "vim-block-cursor" }));
              } catch {
                // fall through to widget
                const cursorEl = document.createElement("span");
                cursorEl.className = "vim-block-cursor vim-block-cursor-widget";
                cursorEl.textContent = "\u00a0";
                decos.push(Decoration.widget(cursorPos, cursorEl));
              }
            } else {
              // Empty line — widget cursor
              const cursorEl = document.createElement("span");
              cursorEl.className = "vim-block-cursor vim-block-cursor-widget";
              cursorEl.textContent = "\u00a0";
              decos.push(Decoration.widget(cursorPos, cursorEl));
            }

            // Sort decorations by from position for DecorationSet.create
            decos.sort((a, b) => a.from - b.from);
            return DecorationSet.create(state.doc, decos);
          },
          handleTextInput() {
            return storage.mode !== "insert";
          },
          handlePaste() {
            return storage.mode !== "insert";
          },
          handleDrop() {
            return storage.mode !== "insert";
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

            // VISUAL MODE
            if (storage.mode === "visual") {
              const { state: vState } = view;
              const { doc: vDoc } = vState;
              const cursorPos = visualHead;
              const $head = vDoc.resolve(cursorPos);

              const vKey = event.key;

              switch (vKey) {
                case "Escape":
                case "v":
                  // Exit visual, collapse to cursor pos
                  setMode("normal");
                  moveTo(vDoc, view, cursorPos);
                  return true;

                // --- Movement (extends selection) ---
                case "h":
                  visualMoveTo(vDoc, view, cursorPos - 1);
                  return true;
                case "l":
                  visualMoveTo(vDoc, view, cursorPos + 1);
                  return true;
                case "j": {
                  const coords = view.coordsAtPos(cursorPos);
                  const below = view.posAtCoords({ left: coords.left, top: coords.bottom + 2 });
                  if (below && below.pos !== cursorPos) {
                    visualMoveTo(vDoc, view, below.pos);
                  } else {
                    const afterBlock = $head.after($head.depth);
                    if (afterBlock < vDoc.content.size) {
                      visualMoveTo(vDoc, view, afterBlock, 1);
                    }
                  }
                  return true;
                }
                case "k": {
                  const coords = view.coordsAtPos(cursorPos);
                  const above = view.posAtCoords({ left: coords.left, top: coords.top - 2 });
                  if (above && above.pos !== cursorPos) {
                    visualMoveTo(vDoc, view, above.pos, -1);
                  } else {
                    const beforeBlock = $head.before($head.depth);
                    if (beforeBlock > 0) {
                      visualMoveTo(vDoc, view, beforeBlock - 1, -1);
                    }
                  }
                  return true;
                }
                case "w": {
                  const $cur = vDoc.resolve(cursorPos);
                  const wEnd = $cur.end($cur.depth);
                  const textAfter = vDoc.textBetween(cursorPos, wEnd, "\0", "\0");
                  const wm = textAfter.match(/^.?\S*\s+/);
                  if (wm) {
                    visualMoveTo(vDoc, view, cursorPos + wm[0].length);
                  } else {
                    const afterBlock = $cur.after($cur.depth);
                    if (afterBlock < vDoc.content.size) {
                      visualMoveTo(vDoc, view, afterBlock, 1);
                    }
                  }
                  return true;
                }
                case "b": {
                  const $cur = vDoc.resolve(cursorPos);
                  const bStart = $cur.start($cur.depth);
                  const textBefore = vDoc.textBetween(bStart, cursorPos, "\0", "\0");
                  const bm = textBefore.match(/\s(\S+)$/);
                  if (bm) {
                    visualMoveTo(vDoc, view, cursorPos - bm[1].length);
                  } else if (cursorPos > bStart) {
                    visualMoveTo(vDoc, view, bStart);
                  } else {
                    visualMoveTo(vDoc, view, bStart - 1, -1);
                  }
                  return true;
                }
                case "e": {
                  const $cur = vDoc.resolve(cursorPos);
                  const eEnd = $cur.end($cur.depth);
                  const textAfterE = vDoc.textBetween(cursorPos, eEnd, "\0", "\0");
                  const em = textAfterE.match(/^.?\s*\S+/);
                  if (em) {
                    visualMoveTo(vDoc, view, cursorPos + em[0].length - 1);
                  } else if (cursorPos < eEnd - 1) {
                    visualMoveTo(vDoc, view, eEnd - 1);
                  } else {
                    visualMoveTo(vDoc, view, eEnd + 1, 1);
                  }
                  return true;
                }
                case "0": {
                  const $cur = vDoc.resolve(cursorPos);
                  visualMoveTo(vDoc, view, $cur.start($cur.depth));
                  return true;
                }
                case "$": {
                  const $cur = vDoc.resolve(cursorPos);
                  const end = $cur.end($cur.depth);
                  visualMoveTo(vDoc, view, Math.max(end - 1, $cur.start($cur.depth)));
                  return true;
                }
                case "G":
                  visualMoveTo(vDoc, view, vDoc.content.size - 1);
                  return true;
                case "g":
                  if (pending === "g") {
                    visualMoveTo(vDoc, view, 1);
                    pending = null;
                  } else {
                    pending = "g";
                  }
                  return true;

                // --- Actions on selection ---
                case "d": {
                  // Delete visual range, return to normal
                  const sf = Math.min(visualAnchor, visualHead);
                  const st = Math.min(Math.max(visualAnchor, visualHead) + 1, vDoc.content.size);
                  view.dispatch(vState.tr.delete(sf, st));
                  setMode("normal");
                  return true;
                }
                case "c": {
                  // Change visual range: delete and enter insert
                  const sf = Math.min(visualAnchor, visualHead);
                  const st = Math.min(Math.max(visualAnchor, visualHead) + 1, vDoc.content.size);
                  view.dispatch(vState.tr.delete(sf, st));
                  setMode("insert");
                  return true;
                }

                default:
                  return true;
              }
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

              // --- Visual mode ---
              case "v": {
                visualAnchor = from;
                visualHead = from;
                setMode("visual");
                return true;
              }

              // --- Insert mode transitions ---
              case "i":
                setMode("insert");
                return true;

              case "a": {
                // "after" — insert after current character
                const aPos = Math.min(from + 1, $from.end($from.depth));
                vimDispatch(view, state.tr.setSelection(TextSelection.create(doc, aPos)));
                setMode("insert");
                return true;
              }

              case "I": {
                moveTo(doc, view, $from.start($from.depth));
                setMode("insert");
                return true;
              }

              case "A": {
                // Append at end of line
                vimDispatch(view, state.tr.setSelection(TextSelection.create(doc, $from.end($from.depth))));
                setMode("insert");
                return true;
              }

              case "o": {
                // New line below — move to end of node, split
                const endOfNode = $from.end($from.depth);
                vimDispatch(view, state.tr.setSelection(TextSelection.create(doc, endOfNode)));
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
                vimDispatch(view, tr.setSelection(TextSelection.create(tr.doc, startOfNode)));
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
