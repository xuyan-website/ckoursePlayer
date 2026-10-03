import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface ConfirmUnsavedDialogProps {
  type: "note" | "review";
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function ConfirmUnsavedDialog({ type, onCancel, onDiscard, onSave }: ConfirmUnsavedDialogProps) {
  const { t } = useTranslation();
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-sm font-bold text-foreground">
          {type === "note" ? t("courseDetail.noteUnsaved") : t("courseDetail.reviewUnsaved")}
        </h3>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onDiscard}
            className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("courseDetail.discard")}
          </button>
          <button
            onClick={onSave}
            className="rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
