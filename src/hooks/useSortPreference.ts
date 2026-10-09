import { useState, useCallback } from "react";

export type SortField = "updated" | "created" | "course";
export type SortDir = "desc" | "asc";

const VALID_FIELDS: SortField[] = ["updated", "created", "course"];
const VALID_DIRS: SortDir[] = ["desc", "asc"];

function storageKey(scope: string) {
  return `ckourse-sort-pref-${scope}`;
}

function loadPref(scope: string): { field: SortField; dir: SortDir } {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (VALID_FIELDS.includes(parsed.field) && VALID_DIRS.includes(parsed.dir)) {
        return { field: parsed.field, dir: parsed.dir };
      }
    }
  } catch {}
  return { field: "updated", dir: "desc" };
}

export function useSortPreference(scope: string) {
  const [pref, setPref] = useState(() => loadPref(scope));

  const toggleSort = useCallback((field: SortField) => {
    setPref((prev) => {
      const next = prev.field === field
        ? { field: prev.field, dir: (prev.dir === "desc" ? "asc" : "desc") as SortDir }
        : { field, dir: "desc" as SortDir };
      localStorage.setItem(storageKey(scope), JSON.stringify(next));
      return next;
    });
  }, [scope]);

  return { sortField: pref.field, sortDir: pref.dir, toggleSort };
}
