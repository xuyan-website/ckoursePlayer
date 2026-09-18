import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface UnsavedApi {
  check: () => boolean;
  save: () => void;
  type: "note" | "review";
}

interface UnsavedGuardContextValue {
  registerGuard: (key: string, api: UnsavedApi | null) => void;
  guardedNavigate: (target: string) => void;
}

const UnsavedGuardContext = createContext<UnsavedGuardContextValue | null>(null);

export function useUnsavedGuard() {
  return useContext(UnsavedGuardContext);
}

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const guardsRef = useRef(new Map<string, UnsavedApi>());
  const [dialogState, setDialogState] = useState<{
    type: "note" | "review";
    save: () => void;
    target: string;
  } | null>(null);

  const registerGuard = useCallback((key: string, api: UnsavedApi | null) => {
    if (api) {
      guardsRef.current.set(key, api);
    } else {
      guardsRef.current.delete(key);
    }
  }, []);

  const guardedNavigate = useCallback((target: string) => {
    for (const api of guardsRef.current.values()) {
      if (api.check()) {
        setDialogState({ type: api.type, save: api.save, target });
        return;
      }
    }
    navigate(target);
  }, [navigate]);

  return (
    <UnsavedGuardContext.Provider value={{ registerGuard, guardedNavigate }}>
      {children}
      {dialogState && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setDialogState(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-sm font-bold text-foreground">
              {dialogState.type === "note" ? t("courseDetail.noteUnsaved") : t("courseDetail.reviewUnsaved")}
            </h3>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setDialogState(null)}
                className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  const target = dialogState.target;
                  setDialogState(null);
                  navigate(target);
                }}
                className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t("courseDetail.discard")}
              </button>
              <button
                onClick={() => {
                  dialogState.save();
                  const target = dialogState.target;
                  setDialogState(null);
                  navigate(target);
                }}
                className="rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </UnsavedGuardContext.Provider>
  );
}
