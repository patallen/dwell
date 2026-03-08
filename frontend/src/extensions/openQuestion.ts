import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    openQuestion: {
      toggleOpenQuestion: (attrs?: { questionId?: string }) => ReturnType;
      setOpenQuestion: (attrs: { questionId: string }) => ReturnType;
    };
  }
}

export const OpenQuestion = Mark.create({
  name: "openQuestion",
  inclusive: false,

  addAttributes() {
    return {
      questionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-question-id"),
        renderHTML: (attributes) => {
          if (!attributes.questionId) return {};
          return { "data-question-id": attributes.questionId };
        },
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
        (attrs) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attrs);
        },
      setOpenQuestion:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
    };
  },
});
