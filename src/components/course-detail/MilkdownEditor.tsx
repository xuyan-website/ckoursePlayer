import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { Crepe } from "@milkdown/crepe";
import { EditorView } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveReviewImageData } from "@/lib/store";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { addRowAfter, isInTable } from "@milkdown/kit/prose/tables";
import { TextSelection } from "@milkdown/kit/prose/state";
import { tableCellSchema, tableHeaderSchema } from "@milkdown/kit/preset/gfm";
import { hardbreakSchema } from "@milkdown/kit/preset/commonmark";
import { $remark } from "@milkdown/utils";
import { visit } from "unist-util-visit";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/nord.css";

interface PMView {
  dom: HTMLElement;
  state: { selection: { head: number } };
  coordsAtPos: (pos: number) => { top: number; bottom: number };
}

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function scrollCaretIntoViewForMilkdown(view: PMView) {
  const scrollContainer = findScrollContainer(view.dom);
  if (!scrollContainer) return;
  const coords = view.coordsAtPos(view.state.selection.head);
  const containerRect = scrollContainer.getBoundingClientRect();
  const margin = 4;
  if (coords.bottom > containerRect.bottom - margin) {
    scrollContainer.scrollTop += coords.bottom - containerRect.bottom + margin;
  } else if (coords.top < containerRect.top + margin) {
    scrollContainer.scrollTop -= containerRect.top - coords.top + margin;
  }
}

const centeredTableCellSchema = tableCellSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: {
      ...base.attrs,
      alignment: { ...(base.attrs as Record<string, any>).alignment, default: "center" },
    },
  };
});

const centeredTableHeaderSchema = tableHeaderSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: {
      ...base.attrs,
      alignment: { ...(base.attrs as Record<string, any>).alignment, default: "center" },
    },
  };
});

const tableSafeHardbreakSchema = hardbreakSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toMarkdown: {
      ...base.toMarkdown,
      runner: (state: any, node: any) => {
        const elements = (state as any).elements as { type: string }[] | undefined;
        const inTable = !!elements?.some((el) => el.type === "tableCell");
        if (inTable) {
          state.addNode("html", undefined, "<br data-break>");
          return;
        }
        if (node.attrs?.isInline) state.addNode("text", undefined, "\n");
        else state.addNode("break");
      },
    },
  };
});

const brToBreakRemark = $remark(
  "brToBreak",
  () => () => (tree: any) => {
    visit(tree, "html", (node: any, index: number | undefined, parent: any) => {
      if (!parent || index === undefined) return;
      if (!/^<br\s+data-break\s*\/?>$/i.test((node.value ?? "").trim())) return;
      if (!node.position) return;
      parent.children.splice(index, 1, { type: "break", position: node.position });
      return index + 1;
    });
  }
);

interface MilkdownEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
  onImageImported?: (path: string) => void;
}

export interface MilkdownEditorHandle {
  insertMarkdown: (text: string) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(function MilkdownEditor({
  defaultValue = "",
  onChange,
  readOnly = false,
  className,
  autoFocus = false,
  onImageImported,
}, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onImageImportedRef = useRef(onImageImported);
  onImageImportedRef.current = onImageImported;
  const skipFirstRef = useRef(true);
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;

  const insertMarkdown = useCallback((text: string) => {
    const crepe = crepeRef.current;
    if (!crepe) return;
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const doc = parser(text);
      if (!doc) return;
      const tr = view.state.tr;
      tr.replaceSelection(doc.slice(0));
      tr.scrollIntoView();
      view.dispatch(tr);
      view.focus();
    });
  }, []);

  useImperativeHandle(ref, () => ({ insertMarkdown }), [insertMarkdown]);

  useEffect(() => {
    if (!rootRef.current) return;

    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue,
      features: {
        [Crepe.Feature.Placeholder]: false,
      },
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          extensions: [EditorView.lineWrapping],
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const dataUrl = await fileToDataUrl(file);
            const path = await saveReviewImageData(dataUrl);
            onImageImportedRef.current?.(path);
            return path;
          },
          proxyDomURL: (url: string) => {
            if (url.includes("ReviewMDimg")) {
              return convertFileSrc(url);
            }
            return url;
          },
          blockOnUpload: async (file: File) => {
            const dataUrl = await fileToDataUrl(file);
            const path = await saveReviewImageData(dataUrl);
            onImageImportedRef.current?.(path);
            return path;
          },
        },
      },
    });

    crepe.editor.use([
      centeredTableCellSchema,
      centeredTableHeaderSchema,
      tableSafeHardbreakSchema,
      brToBreakRemark,
    ] as any);

    crepe.setReadonly(readOnly);

    crepe.on((listener) => {
      listener.markdownUpdated((_, md) => {
        if (skipFirstRef.current) {
          skipFirstRef.current = false;
          return;
        }
        onChangeRef.current?.(md);
      });
    });

    const getView = () => {
      const crepe = crepeRef.current;
      if (!crepe) return null;
      return crepe.editor.action((ctx) => ctx.get(editorViewCtx));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        const view = getView();
        if (view) {
          e.preventDefault();
          e.stopPropagation();
          if (isInTable(view.state)) {
            const hardBreak = view.state.schema.nodes.hardbreak;
            if (hardBreak) {
              view.dispatch(view.state.tr.replaceSelectionWith(hardBreak.create(), false));
            }
          }
        }
      }
      if (e.key === "Enter" && e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const view = getView();
        if (view && isInTable(view.state)) {
          e.preventDefault();
          addRowAfter(view.state, view.dispatch);
        }
      }
      if (e.key === "Enter") {
        const view = getView();
        if (view) {
          requestAnimationFrame(() => scrollCaretIntoViewForMilkdown(view));
        }
      }
    };

    const handleTableClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (!target.closest("td, th")) return;
      const view = getView();
      if (!view) return;
      const sel = view.state.selection;
      const name = sel.constructor.name;
      const node = (sel as any).node;
      if (name === "CellSelection") {
        const coords = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (coords == null) return;
        const $pos = view.state.doc.resolve(coords.pos);
        view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
      } else if (name === "NodeSelection" && node?.isTextblock) {
        const coords = view.posAtCoords({ left: e.clientX, top: e.clientY });
        let pos: number;
        if (coords == null) {
          pos = sel.to - 1;
        } else if (coords.pos <= sel.from) {
          pos = sel.from + 1;
        } else if (coords.pos >= sel.to) {
          pos = sel.to - 1;
        } else {
          pos = coords.pos;
        }
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleTableClick, true);

    crepe.create().then(() => {
      if (!rootRef.current) return;
      skipFirstRef.current = false;
    });
    crepeRef.current = crepe;

    if (autoFocusRef.current) {
      focusTimer = setTimeout(() => {
        if (!rootRef.current) return;
        const editor = rootRef.current.querySelector(".ProseMirror") as HTMLElement | null;
        editor?.focus();
      }, 120);
    }

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleTableClick, true);
      crepe.destroy();
      crepeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      const slashMenu = document.querySelector('.milkdown-slash-menu[data-show="true"]');
      if (!slashMenu || slashMenu.contains(e.target as Node)) return;
      const editor = rootRef.current.querySelector(".ProseMirror") as HTMLElement | null;
      if (editor) {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, []);

  return <div ref={rootRef} className={className} />;
});

export function getMarkdown(crepe: Crepe | null): string {
  return crepe?.getMarkdown() ?? "";
}
