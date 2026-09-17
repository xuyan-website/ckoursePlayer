import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  TrashIcon as Trash,
  PencilSimpleIcon as PencilSimple,
  XIcon as X,
  FileArrowDownIcon as FileArrowDown,
  ArrowRightIcon as ArrowRight,
  BookOpenIcon as BookOpen,
  FunnelIcon as Funnel,
  SortAscendingIcon as SortAscending,
  SortDescendingIcon as SortDescending,
} from "@phosphor-icons/react";
import type { ReviewWithCourse } from "@/types";
import {
  getAllReviews,
  updateReview,
  deleteReview,
  exportReviewsZip,
  revealInExplorer,
  type ExportReviewItemData,
} from "@/lib/store";
import { usePageVisible } from "@/hooks/usePageVisible";
import { MilkdownEditor } from "@/components/course-detail/MilkdownEditor";
import { SquircleSearch } from "@/components/ui/SquircleSearch";
import { reportError } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { EASE_OUT, SNAPPY } from "@/lib/constants";

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

type SortField = "updated" | "created" | "course";
type SortDir = "desc" | "asc";

export function Reviews() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const reload = useCallback(() => {
    getAllReviews()
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  usePageVisible("/reviews", reload);

  const courseGroups = reviews.reduce<Map<number, { title: string; count: number; color: string }>>(
    (acc, r) => {
      const existing = acc.get(r.courseId);
      if (existing) {
        existing.count++;
      } else {
        acc.set(r.courseId, { title: r.courseTitle, count: 1, color: r.accentColor });
      }
      return acc;
    },
    new Map(),
  );

  const filtered = useMemo(() => {
    let result = reviews.filter((r) => {
      const matchesSearch =
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.content.toLowerCase().includes(search.toLowerCase()) ||
        r.lessonTitle.toLowerCase().includes(search.toLowerCase());
      const matchesCourse = courseFilter === null || r.courseId === courseFilter;
      return matchesSearch && matchesCourse;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "updated") {
        cmp = a.updatedAt.localeCompare(b.updatedAt);
      } else if (sortField === "created") {
        cmp = a.createdAt.localeCompare(b.createdAt);
      } else {
        cmp = a.courseTitle.localeCompare(b.courseTitle) || a.updatedAt.localeCompare(b.updatedAt);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [reviews, search, courseFilter, sortField, sortDir]);

  const handleEdit = (review: ReviewWithCourse) => {
    setEditingId(review.id);
    setEditContent(review.content);
  };

  const handleSaveEdit = () => {
    if (editingId === null) return;
    const title = extractTitle(editContent);
    updateReview(editingId, title, editContent)
      .then(() => {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === editingId
              ? { ...r, title, content: editContent, updatedAt: new Date().toISOString() }
              : r,
          ),
        );
        setEditingId(null);
        setEditContent("");
      })
      .catch((err) => {
        reportError(err, "Reviews.handleSaveEdit");
        toast.error(t("reviews.exportFailed"));
      });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField],
  );

  const handleDelete = (reviewId: number) => {
    deleteReview(reviewId)
      .then(() => {
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
        toast(t("courseDetail.deleted"), { className: "toast-red-text" });
      })
      .catch((err) => {
        reportError(err, "Reviews.handleDelete");
        toast.error(t("courseDetail.couldntDeleteReview"));
      });
  };

  const handleExportAll = async () => {
    if (filtered.length === 0) return;
    try {
      const sanitize = (s: string) =>
        s.replace(/[/\\:*?"<>|]/g, "").trim().slice(0, 50);

      let nameBase = "ReviewMD";
      if (courseFilter !== null) {
        const info = courseGroups.get(courseFilter);
        if (info) nameBase = sanitize(info.title) || "ReviewMD";
      }
      if (search) {
        nameBase += `-${sanitize(search)}`;
      }

      const outputPath = await save({
        defaultPath: `${nameBase}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!outputPath) return;

      const items: ExportReviewItemData[] = filtered.map((r) => ({
        sectionTitle: r.sectionTitle,
        lessonTitle: r.lessonTitle,
        title: r.title,
        content: r.content,
      }));
      await exportReviewsZip(items, outputPath);
      toast.success(t("reviews.exportSuccess"));
      await revealInExplorer(outputPath);
    } catch (err) {
      console.error("export reviews failed", err);
      toast.error(t("reviews.exportFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-sans text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <div
          className="flex flex-col items-center justify-center gap-3 py-32 text-center"
          style={{ animation: `card-in 350ms ${EASE_OUT} both` }}
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-secondary">
            <BookOpen className="size-6 text-muted-foreground" />
          </div>
          <h2 className="font-heading text-lg font-bold text-foreground">
            {t("reviews.noReviewsYet")}
          </h2>
          <p className="max-w-xs font-sans text-sm text-muted-foreground">
            {t("reviews.noReviewsDesc")}
          </p>
        </div>
      </div>
    );
  }

  const SortIcon = sortDir === "desc" ? SortDescending : SortAscending;

  return (
    <div className="mx-auto max-w-6xl">
      <div
        className="mb-6"
        style={{ animation: `card-in 350ms ${EASE_OUT} both` }}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">
              {t("reviews.title")}
            </h2>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              {t("reviews.countAcrossCourses", { reviewCount: reviews.length, courseCount: courseGroups.size })}
            </p>
          </div>
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            style={{ transitionTimingFunction: SNAPPY }}
          >
            <FileArrowDown className="size-3.5" />
            {t("reviews.export")}
          </button>
        </div>
      </div>

      <div
        className="mb-4 flex items-center gap-3"
        style={{ animation: `card-in 350ms ${EASE_OUT} 40ms both` }}
      >
        <SquircleSearch
          value={search}
          onChange={setSearch}
          placeholder={t("reviews.searchPlaceholder")}
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          {(["updated", "created", "course"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition-colors",
                sortField === field
                  ? "border border-border bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {field === "updated" ? t("reviews.modified") : field === "created" ? t("reviews.created") : t("reviews.course")}
              {sortField === field && <SortIcon className="size-3" />}
            </button>
          ))}
        </div>
      </div>

      {courseGroups.size > 1 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-1.5"
          style={{ animation: `card-in 350ms ${EASE_OUT} 80ms both` }}
        >
          <Funnel className="mr-0.5 size-3.5 text-muted-foreground/50" />
          <button
            onClick={() => setCourseFilter(null)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-colors",
              courseFilter === null
                ? "border border-border bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("common.all")}
            <span className="font-mono text-[9px] text-muted-foreground/60">
              {reviews.length}
            </span>
          </button>
          {[...courseGroups.entries()].map(([id, info]) => (
            <button
              key={id}
              onClick={() => setCourseFilter(courseFilter === id ? null : id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-colors",
                courseFilter === id
                  ? "border border-border bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: info.color }}
              />
              <span className="max-w-32 truncate">{info.title}</span>
              <span className="font-mono text-[9px] text-muted-foreground/60">
                {info.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 py-20 text-center"
          style={{ animation: `card-in 350ms ${EASE_OUT} both` }}
        >
          <BookOpen className="size-8 text-muted-foreground/40" />
          <p className="font-sans text-sm font-medium text-muted-foreground">{t("reviews.noMatching")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((review, index) => (
            <div
              key={review.id}
              className="rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border"
              style={{
                animation: `card-in 350ms ${EASE_OUT} ${100 + index * 30}ms both`,
              }}
            >
              {editingId === review.id ? (
                <div>
                  <MilkdownEditor
                    defaultValue={editContent}
                    onChange={setEditContent}
                    className="review-editor"
                  />
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      onClick={handleCancelEdit}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-sans text-sm font-semibold text-foreground">
                        {review.title || extractTitle(review.content)}
                      </h3>
                      <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
                        {review.sectionTitle}-{review.lessonTitle}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => navigate(`/course/${review.courseId}`)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        title={t("reviews.goToLesson")}
                      >
                        <ArrowRight className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(review)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        title={t("reviews.editReview")}
                      >
                        <PencilSimple className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(review.id)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title={t("reviews.deleteReview")}
                      >
                        <Trash className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-3 font-sans text-xs leading-relaxed text-muted-foreground">
                    {review.content.replace(/[#*_`~\[\]()!]/g, "").trim().slice(0, 200)}
                  </p>
                  <p className="mt-1.5 font-sans text-[10px] text-muted-foreground/60">
                    {review.courseTitle} · {review.updatedAt}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
