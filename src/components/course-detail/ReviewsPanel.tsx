import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { TrashIcon as Trash, PencilSimpleIcon as PencilSimple, PlusIcon as Plus, XIcon as X, ArrowsOutSimpleIcon as ArrowsOutSimple } from "@phosphor-icons/react";
import type { Review } from "@/types";
import { MilkdownEditor } from "./MilkdownEditor";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SNAPPY } from "@/lib/constants";
import { toast } from "sonner";

interface ReviewsPanelProps {
  reviews: Review[];
  onAdd: (title: string, content: string) => void;
  onEdit: (reviewId: number, title: string, content: string) => void;
  onDelete: (reviewId: number) => void;
}

function extractTitle(content: string): string {
  for (const line of content.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#")) {
      const title = trimmed.replace(/^#+\s*/, "");
      if (title) return title;
    }
  }
  return content.replace(/\s/g, "").slice(0, 10);
}

function previewText(content: string): string {
  const lines = content.split("\n").filter((l) => !l.trimStart().startsWith("#"));
  return lines.join(" ").replace(/[*_`~\[\]()!]/g, "").trim().slice(0, 100);
}

export function ReviewsPanel({
  reviews,
  onAdd,
  onEdit,
  onDelete,
}: ReviewsPanelProps) {
  const { t } = useTranslation();
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const handleStartAdd = useCallback(() => {
    setShowEditor(true);
    setEditingId(null);
    setContent("");
  }, []);

  const handleStartEdit = useCallback((review: Review) => {
    setEditingId(review.id);
    setShowEditor(false);
    setContent(review.content);
  }, []);

  const handleSave = useCallback(() => {
    if (!content.trim()) return;
    const title = extractTitle(content);
    if (editingId !== null) {
      onEdit(editingId, title, content);
      setEditingId(null);
    } else {
      onAdd(title, content);
      setShowEditor(false);
    }
    setContent("");
    toast.success(t("courseDetail.saved"));
  }, [content, editingId, onAdd, onEdit, t]);

  const handleCancel = useCallback(() => {
    setShowEditor(false);
    setEditingId(null);
    setContent("");
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
      if (expanded) {
        setExpanded(false);
        setEditorKey((k) => k + 1);
      }
    }
  }, [handleSave, expanded]);

  const handleDelete = useCallback(
    (reviewId: number) => {
      onDelete(reviewId);
      if (editingId === reviewId) {
        setEditingId(null);
        setContent("");
      }
    },
    [onDelete, editingId],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {!showEditor && editingId === null && (
          <button
            onClick={handleStartAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-1.5 font-sans text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-3.5" />
            {t("reviewsPanel.addReview")}
          </button>
        )}
      </div>

      {(showEditor || editingId !== null) && (
        <div className="rounded-lg border border-border/60 bg-card p-2" onKeyDown={handleKeyDown}>
          <div className="relative">
            <MilkdownEditor
              key={editorKey}
              defaultValue={content}
              onChange={setContent}
              className="review-editor"
              autoFocus={!content}
            />
            <button
              onClick={handleCancel}
              title={t("common.close")}
              className="absolute top-1 right-8 z-10 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <button
              onClick={() => setExpanded(true)}
              title={t("reviewsPanel.expand")}
              className="absolute top-1 right-1 z-10 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowsOutSimple className="size-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              onClick={handleCancel}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      {reviews.length === 0 && !showEditor && editingId === null && (
        <p className="py-4 text-center font-sans text-xs text-muted-foreground">
          {t("reviewsPanel.noReviews")}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {reviews.map((review) => (
          <div
            key={review.id}
            className={cn(
              "rounded-lg border border-border/50 bg-card p-2.5 transition-colors",
              editingId === review.id && "ring-1 ring-primary/30",
            )}
          >
            {editingId === review.id ? null : (
              <>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h4 className="font-sans text-xs font-semibold text-foreground">
                    {review.title || extractTitle(review.content)}
                  </h4>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => handleStartEdit(review)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title={t("reviewsPanel.edit")}
                    >
                      <PencilSimple className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(review.id)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                      title={t("reviewsPanel.delete")}
                    >
                      <Trash className="size-3.5" />
                    </button>
                  </div>
                </div>
                <p className="font-sans text-[11px] leading-relaxed text-muted-foreground">
                  {previewText(review.content) || t("reviewsPanel.emptyContent")}
                </p>
                <p className="mt-1 font-sans text-[10px] text-muted-foreground/70">
                  {review.updatedAt}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setExpanded(false);
              setEditorKey((k) => k + 1);
            }
          }}
        >
          <div
            className="flex h-[85vh] w-[85vw] max-w-5xl flex-col rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
              <span className="font-sans text-sm font-medium text-foreground">
                {t("reviewsPanel.editExpanded")}
              </span>
              <button
                onClick={() => {
                  setExpanded(false);
                  setEditorKey((k) => k + 1);
                }}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onKeyDown={handleKeyDown}>
              <MilkdownEditor
                defaultValue={content}
                onChange={setContent}
                className="review-editor min-h-full"
                autoFocus={!content}
              />
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-border/50 px-3 py-2">
              <button
                onClick={() => {
                  handleSave();
                  setExpanded(false);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                style={{ transitionTimingFunction: SNAPPY }}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
