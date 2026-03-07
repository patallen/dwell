import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    openQuestion: {
      toggleOpenQuestion: () => ReturnType;
    };
  }
}

export const OpenQuestion = Mark.create({
  name: "openQuestion",

  addAttributes() {
    return {
      status: {
        default: "open",
        parseHTML: (element) => element.getAttribute("data-status") || "open",
        renderHTML: (attributes) => ({ "data-status": attributes.status }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-type="open-question"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, { "data-type": "open-question" }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleOpenQuestion:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
    };
  },
});
