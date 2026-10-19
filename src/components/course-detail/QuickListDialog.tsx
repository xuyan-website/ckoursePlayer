import { useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon as X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { SNAPPY } from "@/lib/constants";

interface QuickListDialogProps {
  onClose: () => void;
  onInsert: (markdown: string) => void;
}

function toChineseNum(n: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return digits[n];
  if (n === 10) return "十";
  if (n < 20) return "十" + digits[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return digits[tens] + "十" + (ones === 0 ? "" : digits[ones]);
}

export function convertIndentedTextToMarkdown(input: string): string {
  const lines = input.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return "";

  const counters: Record<number, number> = {};
  let prevLevel = -1;

  interface GenLine {
    content: string;
    isListItem: boolean;
  }
  const genLines: GenLine[] = [];

  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const level = Math.floor(indent / 4);
    const text = line.trim();

    if (level > prevLevel) {
      counters[level] = 1;
    } else {
      counters[level] = (counters[level] || 0) + 1;
    }
    prevLevel = level;

    let content: string;
    let isListItem: boolean;
    switch (level) {
      case 0:
        content = `# ${text}`;
        isListItem = false;
        break;
      case 1:
        content = `## ${toChineseNum(counters[1])}、${text}`;
        isListItem = false;
        break;
      case 2:
        content = `### ${counters[2]}）${text}`;
        isListItem = false;
        break;
      case 3:
        content = `#### ${counters[3]}、${text}`;
        isListItem = false;
        break;
      default:
        content = `- ${text}`;
        isListItem = true;
        break;
    }
    genLines.push({ content, isListItem });
  }

  const result: string[] = [];
  for (let i = 0; i < genLines.length; i++) {
    result.push(genLines[i].content);
    const next = genLines[i + 1];
    if (next) {
      if (genLines[i].isListItem && next.isListItem) {
        continue;
      }
      result.push("");
    }
  }
  return result.join("\n");
}

function insertTextWithUndo(ta: HTMLTextAreaElement, text: string) {
  if (document.execCommand("insertText", false, text)) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  ta.value = val.slice(0, start) + text + val.slice(end);
  ta.setSelectionRange(start + text.length, start + text.length);
}

function deleteRangeWithUndo(ta: HTMLTextAreaElement, from: number, to: number) {
  ta.setSelectionRange(from, to);
  if (document.execCommand("delete")) return;
  const val = ta.value;
  ta.value = val.slice(0, from) + val.slice(to);
  ta.setSelectionRange(from, from);
}

function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  const borderY = ta.offsetHeight - ta.clientHeight;
  const target = ta.scrollHeight + borderY;
  ta.style.height = `${target}px`;
  if (ta.selectionStart === ta.value.length && ta.scrollHeight > ta.clientHeight) {
    ta.scrollTop = ta.scrollHeight;
  }
}

export function QuickListDialog({ onClose, onInsert }: QuickListDialogProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    autoResize(ta);
    let composing = false;
    const onInput = () => {
      if (!composing) requestAnimationFrame(() => autoResize(ta));
    };
    const onCompositionStart = () => { composing = true; };
    const onCompositionEnd = () => {
      composing = false;
      autoResize(ta);
    };
    ta.addEventListener("input", onInput);
    ta.addEventListener("compositionstart", onCompositionStart);
    ta.addEventListener("compositionend", onCompositionEnd);
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => autoResize(ta)).catch(() => {});
    }
    return () => {
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("compositionstart", onCompositionStart);
      ta.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd, value } = ta;

    if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const caret = Math.min(selectionStart, selectionEnd);
      const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
      let lineEnd = value.indexOf("\n", lineStart);
      if (lineEnd === -1) lineEnd = value.length;
      const lineText = value.slice(lineStart, lineEnd);
      const leadingMatch = lineText.match(/^(\s*)/);
      const leadingLen = leadingMatch ? leadingMatch[1].length : 0;
      if (caret - lineStart <= leadingLen) {
        e.preventDefault();
        return;
      }
    }

    if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const caret = Math.min(selectionStart, selectionEnd);
      const caretEnd = Math.max(selectionStart, selectionEnd);
      const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
      let lineEnd = value.indexOf("\n", lineStart);
      if (lineEnd === -1) lineEnd = value.length;
      const lineText = value.slice(lineStart, lineEnd);
      const leadingMatch = lineText.match(/^(\s*)/);
      const leadingLen = leadingMatch ? leadingMatch[1].length : 0;
      const offset = caret - lineStart;
      if (selectionStart === selectionEnd) {
        if (e.key === "Backspace" && offset > 0 && offset <= leadingLen) {
          e.preventDefault();
          return;
        }
        if (e.key === "Delete" && offset < leadingLen) {
          e.preventDefault();
          return;
        }
      } else if (caretEnd - lineStart <= leadingLen) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = value.indexOf("\n", lineStart);
      if (lineEnd === -1) lineEnd = value.length;
      const currentLine = value.slice(lineStart, lineEnd);
      const leadingMatch = currentLine.match(/^(\s*)/);
      const indent = leadingMatch ? leadingMatch[1] : "";
      if (start !== end) deleteRangeWithUndo(ta, start, end);
      insertTextWithUndo(ta, "\n" + indent);
      autoResize(ta);
      return;
    }

    if (e.key !== "Tab") return;
    e.preventDefault();

    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    let lineEnd = value.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = value.length;
    const lineText = value.slice(lineStart, lineEnd);
    const leadingMatch = lineText.match(/^(\s*)/);
    const leadingLen = leadingMatch ? leadingMatch[1].length : 0;
    const isBlankLine = lineText.trim() === "";

    if (e.shiftKey) {
      const removeCount = Math.min(leadingLen, 4);
      if (removeCount === 0) return;
      deleteRangeWithUndo(ta, lineStart, lineStart + removeCount);
      const newStart = Math.max(lineStart, selectionStart - removeCount);
      ta.setSelectionRange(newStart, newStart);
      autoResize(ta);
    } else if (isBlankLine) {
      insertTextWithUndo(ta, "    ");
      autoResize(ta);
    } else {
      const insertPos = lineStart + leadingLen;
      ta.setSelectionRange(insertPos, insertPos);
      insertTextWithUndo(ta, "    ");
      const newStart = selectionStart + 4;
      ta.setSelectionRange(newStart, newStart);
      autoResize(ta);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const raw = textareaRef.current?.value ?? "";
    const markdown = convertIndentedTextToMarkdown(raw);
    if (!markdown) return;
    onInsert(markdown);
    onClose();
  }, [onInsert, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
      <div
        className="flex max-h-[70vh] w-[80vw] max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <span className="font-sans text-sm font-medium text-foreground">
            {t("reviewsPanel.quickList")}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-3">
          <textarea
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            placeholder={t("reviewsPanel.quickListPlaceholder")}
            className="w-full resize-none overflow-y-auto rounded-md border border-border/60 bg-background p-3 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary/50 min-h-[6rem] scroll-pb-3 break-words"
            style={{ maxHeight: "calc(70vh - 7.5rem)" }}
            autoFocus
            spellCheck={false}
          />
        </div>
        <div className="flex items-center justify-end gap-1.5 border-t border-border/50 px-3 py-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            style={{ transitionTimingFunction: SNAPPY }}
          >
            {t("reviewsPanel.quickListInsert")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
