import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon as X, PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react";
import { MilkdownEditor } from "./MilkdownEditor";
import { useTranslation } from "react-i18next";
import { SNAPPY } from "@/lib/constants";
import { deleteUnreferencedImportedImages } from "@/lib/store";
import { toast } from "sonner";

interface ReviewPreviewDialogProps {
  content: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

export function ReviewPreviewDialog({ content, onClose, onSave }: ReviewPreviewDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [currentContent, setCurrentContent] = useState(content);
  const [editContent, setEditContent] = useState(content);
  const [editorKey, setEditorKey] = useState(0);
  const [contentMinHeight, setContentMinHeight] = useState<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);
  const importedThisSessionRef = useRef<Set<string>>(new Set());

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const editContentRef = useRef(editContent);
  editContentRef.current = editContent;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = savedScrollRef.current;
      }
      setContentMinHeight(undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [editorKey]);

  const preserveScroll = () => {
    if (scrollRef.current) {
      savedScrollRef.current = scrollRef.current.scrollTop;
      setContentMinHeight(scrollRef.current.scrollHeight);
    }
  };

  const handleSwitchToEdit = useCallback(() => {
    preserveScroll();
    setEditContent(currentContent);
    importedThisSessionRef.current = new Set();
    setMode("edit");
    setEditorKey((k) => k + 1);
  }, [currentContent]);

  const handleSave = useCallback(async () => {
    if (!editContent.trim()) return;
    await deleteUnreferencedImportedImages(importedThisSessionRef.current, editContent);
    importedThisSessionRef.current = new Set();
    preserveScroll();
    onSave(editContent);
    setCurrentContent(editContent);
    setMode("preview");
    setEditorKey((k) => k + 1);
  }, [editContent, onSave]);

  const handleCancelEdit = useCallback(async () => {
    await deleteUnreferencedImportedImages(importedThisSessionRef.current, currentContent);
    importedThisSessionRef.current = new Set();
    preserveScroll();
    setMode("preview");
    setEditorKey((k) => k + 1);
  }, [currentContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  useEffect(() => {
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== "s" && e.key !== "S")) return;
      if (modeRef.current !== "edit") return;
      e.preventDefault();
      const c = editContentRef.current;
      if (!c.trim()) return;
      void deleteUnreferencedImportedImages(importedThisSessionRef.current, c);
      onSaveRef.current(c);
      setCurrentContent(c);
      toast.success(t("courseDetail.saved"));
    };
    document.addEventListener("keydown", handleDocKeyDown);
    return () => document.removeEventListener("keydown", handleDocKeyDown);
  }, [t]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[85vh] w-[85vw] max-w-5xl flex-col rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <span className="font-sans text-sm font-medium text-foreground">
            {mode === "preview" ? t("reviewsPanel.previewExpanded") : t("reviewsPanel.editExpanded")}
          </span>
          <div className="flex items-center gap-1">
            {mode === "preview" && (
              <button
                onClick={handleSwitchToEdit}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title={t("reviewsPanel.edit")}
              >
                <PencilSimple className="size-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={t("common.close")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto" onKeyDown={mode === "edit" ? handleKeyDown : undefined} style={{backgroundColor:"#fdfcff"}}>
          <div style={{ minHeight: contentMinHeight }}>
            <MilkdownEditor
              key={editorKey}
              defaultValue={mode === "preview" ? currentContent : editContent}
              onChange={setEditContent}
              readOnly={mode === "preview"}
              className="review-editor min-h-full"
              onImageImported={(p) => importedThisSessionRef.current.add(p)}
            />
          </div>
        </div>
        {mode === "edit" && (
          <div className="flex items-center justify-end gap-1.5 border-t border-border/50 px-3 py-2">
            <button
              onClick={handleCancelEdit}
              className="rounded-md px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              style={{ transitionTimingFunction: SNAPPY }}
            >
              {t("common.save")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
