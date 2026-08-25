import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon as ArrowLeft,
  PaletteIcon as Palette,
  TrashIcon as Trash,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  FloppyDiskIcon as FloppyDisk,
  WarningIcon as Warning,
  FolderOpenIcon as FolderOpen,
  DotsSixVerticalIcon as DotsSixVertical,
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SquircleButton } from "@/components/ui/SquircleButton";
import { EASE_OUT, SNAPPY } from "@/lib/constants";
import type { CourseCategory, Course, Section, Lesson } from "@/types";
import {
  getCustomCategories,
  addCustomCategory,
  deleteCustomCategory,
  reorderSections as storeReorderSections,
  reorderLessons as storeReorderLessons,
} from "@/lib/store";

const builtinCategories: { value: CourseCategory; label: string }[] = [
  { value: "frontend", label: "dashboard.categories.frontend" },
  { value: "backend", label: "dashboard.categories.backend" },
  { value: "devops", label: "dashboard.categories.devops" },
  { value: "database", label: "dashboard.categories.database" },
  { value: "design", label: "dashboard.categories.design" },
  { value: "other", label: "dashboard.categories.other" },
];

const accentColors = [
  "#61DAFB",
  "#F74C00",
  "#8B5CF6",
  "#3178C6",
  "#2496ED",
  "#336791",
  "#E44D26",
  "#38BDF8",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#C8F135",
];

interface CourseEditPanelProps {
  course: Course;
  sections: Section[];
  onSave: (title: string, author: string, accentColor: string, category: string) => Promise<void>;
  onResetProgress: () => Promise<void>;
  onDelete: () => Promise<void>;
  onReorder: () => Promise<void>;
  onBack: () => void;
  className?: string;
}

export function CourseEditPanel({
  course,
  sections,
  onSave,
  onResetProgress,
  onDelete,
  onReorder,
  onBack,
  className,
}: CourseEditPanelProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(course.title);
  const [author, setAuthor] = useState(course.author);
  const [category, setCategory] = useState<string>(course.category);
  const [accentColor, setAccentColor] = useState(course.accentColor);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  useEffect(() => {
    getCustomCategories().then(setCustomCategories).catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [localSections, setLocalSections] = useState(sections);

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setLocalSections((prev) => {
        const fromIdx = prev.findIndex((s) => String(s.id) === String(active.id));
        const toIdx = prev.findIndex((s) => String(s.id) === String(over.id));
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = arrayMove(prev, fromIdx, toIdx);
        storeReorderSections(course.id, next.map((s) => s.id)).then(onReorder).catch(() => {});
        return next;
      });
    },
    [course.id, onReorder],
  );

  const handleLessonDragEnd = useCallback(
    (sectionId: number, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setLocalSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const fromIdx = s.lessons.findIndex((l) => String(l.id) === String(active.id));
          const toIdx = s.lessons.findIndex((l) => String(l.id) === String(over.id));
          if (fromIdx === -1 || toIdx === -1) return s;
          const nextLessons = arrayMove(s.lessons, fromIdx, toIdx);
          storeReorderLessons(sectionId, nextLessons.map((l) => l.id)).then(onReorder).catch(() => {});
          return { ...s, lessons: nextLessons };
        }),
      );
    },
    [onReorder],
  );

  useState(() => {
    requestAnimationFrame(() => setMounted(true));
  });

  const hasChanges =
    title.trim() !== course.title ||
    author.trim() !== course.author ||
    category !== course.category ||
    accentColor !== course.accentColor;

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(title.trim(), author.trim(), accentColor, category);
      setSaved(true);
      toast.success(t("courseEdit.courseSaved"));
      setTimeout(() => onBack(), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("courseEdit.pleaseTryAgain");
      setSaveError(msg);
      toast.error(t("courseEdit.couldntSaveCourse"), { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleResetProgress = async () => {
    await onResetProgress();
    setConfirmReset(false);
    onBack();
  };

  const handleDelete = async () => {
    await onDelete();
  };

  return (
    <div className={cn("mx-auto max-w-3xl", className)}>
      <div
        className="mb-4"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          transition: `opacity 500ms ${EASE_OUT}, transform 500ms ${EASE_OUT}`,
        }}
      >
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("courseEdit.backToCourse")}
        </button>
      </div>

      <div
        className="mb-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: `opacity 600ms ${EASE_OUT} 40ms, transform 600ms ${EASE_OUT} 40ms`,
        }}
      >
        <h2 className="font-heading text-2xl font-bold text-foreground">
          {t("courseEdit.editCourse")}
        </h2>
        <p className="mt-2 font-sans text-sm text-muted-foreground">
          {t("courseEdit.editCourseDesc")}
        </p>
      </div>

      <div
        className="mb-6"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: `opacity 600ms ${EASE_OUT} 80ms, transform 600ms ${EASE_OUT} 80ms`,
        }}
      >
        <div className="group relative">
          <div className="squircle-subtle absolute inset-0 bg-border" />
          <div className="squircle-subtle absolute inset-px bg-card" />
          <div className="relative flex items-center gap-3 px-4 py-3">
            <FolderOpen className="size-4 shrink-0 text-primary" />
            <span className="truncate font-mono text-xs text-muted-foreground">
              {course.folderPath}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div
          className="flex flex-col gap-5"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(12px)",
            transition: `opacity 600ms ${EASE_OUT} 120ms, transform 600ms ${EASE_OUT} 120ms`,
          }}
        >
          <h3 className="font-heading text-base font-bold text-foreground">
            {t("import.courseDetails")}
          </h3>

          <FieldGroup label={t("courseEdit.title")}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("import.courseTitle")}
              className="w-full bg-transparent font-sans text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
          </FieldGroup>

          <FieldGroup label={t("courseEdit.author")}>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t("import.instructorName")}
              className="w-full bg-transparent font-sans text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
          </FieldGroup>

          <CategoryPicker
            category={category}
            onCategoryChange={setCategory}
            customCategories={customCategories}
            onCustomCategoriesChange={setCustomCategories}
          />

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 font-sans text-xs font-medium text-muted-foreground">
              <Palette className="size-3.5" />
              {t("courseEdit.accentColor")}
            </label>
            <div className="flex flex-wrap gap-2">
              {accentColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setAccentColor(color)}
                  className={cn(
                    "size-7 rounded-full border-2 transition-transform duration-150",
                    accentColor === color
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <SquircleButton
              variant="primary"
              onClick={handleSave}
              disabled={!title.trim() || !hasChanges || saving || saved}
            >
              <FloppyDisk className="size-4" weight="bold" />
              {saving ? t("courseEdit.saving") : saved ? t("courseEdit.saved") : t("courseEdit.saveChanges")}
            </SquircleButton>
            {saved && (
              <span className="font-sans text-xs font-medium text-primary">
                {t("courseEdit.courseUpdatedSuccessfully")}
              </span>
            )}
            {saveError && (
              <span className="font-sans text-xs font-medium text-destructive">
                {saveError}
              </span>
            )}
            {hasChanges && !saved && !saveError && (
              <span className="font-sans text-xs text-muted-foreground">
                {t("courseEdit.unsavedChanges")}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex flex-col gap-5"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(12px)",
            transition: `opacity 600ms ${EASE_OUT} 160ms, transform 600ms ${EASE_OUT} 160ms`,
          }}
        >
          <h3 className="font-heading text-base font-bold text-foreground">
            {t("courseEdit.manage")}
          </h3>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/10">
                <ArrowCounterClockwise className="size-4 text-info" />
              </div>
              <div className="flex-1">
                <p className="font-sans text-sm font-medium text-foreground">
                  {t("courseEdit.resetProgress")}
                </p>
                <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                  {t("courseEdit.resetProgressDesc")}
                </p>
                {!confirmReset ? (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="mt-3 rounded-md border border-border px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    style={{ transitionTimingFunction: SNAPPY }}
                  >
                    {t("courseEdit.resetProgress")}
                  </button>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleResetProgress}
                      className="rounded-md bg-info/15 px-3 py-1.5 font-sans text-xs font-medium text-info transition-colors hover:bg-info/25"
                      style={{ transitionTimingFunction: SNAPPY }}
                    >
                      {t("courseEdit.confirmReset")}
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="rounded-md px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <Trash className="size-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-sans text-sm font-medium text-foreground">
                  {t("courseEdit.deleteCourse")}
                </p>
                <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                  {t("courseEdit.deleteCourseDesc")}
                </p>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-1.5 font-sans text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                    style={{ transitionTimingFunction: SNAPPY }}
                  >
                    {t("courseEdit.deleteCourse")}
                  </button>
                ) : (
                  <div className="mt-3">
                    <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2">
                      <Warning
                        className="size-3.5 shrink-0 text-destructive"
                        weight="bold"
                      />
                      <span className="font-sans text-xs text-destructive">
                        {t("courseEdit.deleteWarning")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDelete}
                        className="rounded-md bg-destructive px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-destructive/90"
                        style={{ transitionTimingFunction: SNAPPY }}
                      >
                        {t("courseEdit.yesDelete")}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="rounded-md px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: `opacity 600ms ${EASE_OUT} 200ms, transform 600ms ${EASE_OUT} 200ms`,
        }}
      >
        <h3 className="mb-4 font-heading text-base font-bold text-foreground">
          {t("import.courseStructure")}
        </h3>
        <div className="h-80 overflow-y-scroll rounded-xl border border-border bg-card px-3 py-2">
          <DndContext
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={localSections.map((s) => String(s.id))}
              strategy={verticalListSortingStrategy}
            >
              {localSections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  onLessonDragEnd={handleLessonDragEnd}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

function SortableSection({
  section,
  onLessonDragEnd,
}: {
  section: Section;
  onLessonDragEnd: (sectionId: number, event: DragEndEvent) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(section.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lessonSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 py-1.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground touch-none"
        >
          <DotsSixVertical className="size-3.5" />
        </button>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-muted-foreground/60 hover:text-foreground"
        >
          {isOpen ? <CaretDown className="size-3" /> : <CaretRight className="size-3" />}
        </button>
        <span className="flex-1 font-sans text-sm font-medium text-foreground">
          {section.title}
        </span>
        <span className="font-sans text-xs text-muted-foreground">
          {section.lessons.length} {section.lessons.length === 1 ? t("common.lesson") : t("common.lessons")}
        </span>
      </div>
      {isOpen && (
        <div className="ml-5 border-l border-border/50 pl-2">
          <DndContext
            sensors={lessonSensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onLessonDragEnd(section.id, e)}
          >
            <SortableContext
              items={section.lessons.map((l) => String(l.id))}
              strategy={verticalListSortingStrategy}
            >
              {section.lessons.map((lesson, li) => (
                <SortableLesson key={lesson.id} lesson={lesson} index={li} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function SortableLesson({ lesson, index }: { lesson: Lesson; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(lesson.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground touch-none"
      >
        <DotsSixVertical className="size-3" />
      </button>
      <span className="flex size-4 items-center justify-center rounded-full bg-secondary font-mono text-[9px] text-muted-foreground">
        {index + 1}
      </span>
      <span className="flex-1 font-sans text-xs text-foreground/80">
        {lesson.title}
      </span>
    </div>
  );
}

function CategoryPicker({
  category,
  onCategoryChange,
  customCategories,
  onCustomCategoriesChange,
}: {
  category: string;
  onCategoryChange: (v: string) => void;
  customCategories: string[];
  onCustomCategoriesChange: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const isBuiltin = builtinCategories.some((c) => c.value === trimmed.toLowerCase());
    const isDuplicate = customCategories.includes(trimmed);
    if (!isBuiltin && !isDuplicate) {
      await addCustomCategory(trimmed);
      onCustomCategoriesChange([...customCategories, trimmed]);
    }
    onCategoryChange(trimmed);
    setNewName("");
    setAdding(false);
  };

  const handleDelete = async (name: string) => {
    await deleteCustomCategory(name);
    onCustomCategoriesChange(customCategories.filter((c) => c !== name));
    if (category === name) onCategoryChange("other");
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="font-sans text-xs font-medium text-muted-foreground">
        {t("courseEdit.category")}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {builtinCategories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => onCategoryChange(cat.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 font-sans text-xs font-medium transition-colors duration-150",
              category === cat.value
                ? "border-primary/25 bg-primary/15 text-primary"
                : "border-border/50 bg-secondary text-muted-foreground hover:text-foreground",
            )}
            style={{ transitionTimingFunction: SNAPPY }}
          >
            {t(cat.label)}
          </button>
        ))}
        {customCategories.map((name) => (
          <div
            key={name}
            className={cn(
              "group flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1.5 font-sans text-xs font-medium transition-colors duration-150",
              category === name
                ? "border-primary/25 bg-primary/15 text-primary"
                : "border-border/50 bg-secondary text-muted-foreground hover:text-foreground",
            )}
            style={{ transitionTimingFunction: SNAPPY }}
          >
            <button onClick={() => onCategoryChange(name)}>{name}</button>
            <button
              onClick={() => handleDelete(name)}
              className="flex items-center justify-center rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
        {adding ? (
          <div className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 pl-3 pr-1.5 py-1.5">
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder={t("import.categoryName")}
              className="w-24 bg-transparent font-sans text-xs text-primary placeholder:text-primary/50 focus:outline-none"
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAdd}
              className="flex items-center justify-center rounded-full p-1 text-primary transition-colors hover:bg-primary/20"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAdding(false); setNewName(""); }}
              className="flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-black/10"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-border/50 px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/25 hover:text-primary"
            style={{ transitionTimingFunction: SNAPPY }}
          >
            {t("import.custom")}
          </button>
        )}
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-sans text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="group/field relative">
        <div className="squircle absolute inset-0 bg-border/25 transition-colors group-focus-within/field:bg-primary" />
        <div className="squircle absolute inset-px bg-card" />
        <div className="relative px-4 py-2.5">{children}</div>
      </div>
    </div>
  );
}
