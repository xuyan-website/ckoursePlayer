import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { EditorView } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveReviewImageData } from "@/lib/store";
import { editorViewCtx } from "@milkdown/kit/core";
import { addRowAfter, isInTable } from "@milkdown/kit/prose/tables";
import { TextSelection } from "@milkdown/kit/prose/state";
import { tableCellSchema, tableHeaderSchema } from "@milkdown/kit/preset/gfm";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/nord.css";

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

interface MilkdownEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
  onImageImported?: (path: string) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MilkdownEditor({
  defaultValue = "",
  onChange,
  readOnly = false,
  className,
  autoFocus = false,
  onImageImported,
}: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onImageImportedRef = useRef(onImageImported);
  onImageImportedRef.current = onImageImported;
  const skipFirstRef = useRef(true);
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;

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

    crepe.editor.use([centeredTableCellSchema, centeredTableHeaderSchema] as any);

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
      if (e.key === "Enter" && e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const view = getView();
        if (view && isInTable(view.state)) {
          e.preventDefault();
          addRowAfter(view.state, view.dispatch);
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
}

export function getMarkdown(crepe: Crepe | null): string {
  return crepe?.getMarkdown() ?? "";
}
