import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { EditorView } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveReviewImageData } from "@/lib/store";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/nord.css";

interface MilkdownEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
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
}: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
            return await saveReviewImageData(dataUrl);
          },
          proxyDomURL: (url: string) => {
            if (url.includes("ReviewMDimg")) {
              return convertFileSrc(url);
            }
            return url;
          },
          blockOnUpload: async (file: File) => {
            const dataUrl = await fileToDataUrl(file);
            return await saveReviewImageData(dataUrl);
          },
        },
      },
    });

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
