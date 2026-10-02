import { useRef, useState } from "react";
import {
  NotePencilIcon as NotePencil,
  PencilSimpleIcon as PencilSimple,
  TrashIcon as Trash,
  XIcon as X,
} from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor";
import { CollapsibleImages } from "./CollapsibleImages";
import { SNAPPY } from "@/lib/constants";
import { highlightAllCodeBlocks } from "@/lib/highlight";
import { useDetachableWindow } from "@/hooks/useDetachableWindow";
import type { Note } from "@/types";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/format";

interface NotesPanelProps {
  notes: Note[];
  videoTime: number;
  editingNoteId: number | null;
  showEditor: boolean;
  onAdd: (content: string) => void;
  onEdit: (noteId: number, content: string, imagePaths: string[]) => void;
  onSaveOnlyEdit?: (noteId: number, content: string, imagePaths: string[]) => void | Promise<void>;
  onSaveOnlyAdd?: (content: string, imagePaths: string[]) => Promise<number | null>;
  onDelete: (noteId: number) => void;
  onSetEditing: (id: number | null) => void;
  onSetShowEditor: (show: boolean) => void;
  onTimestampClick?: (seconds: number, lessonId: number) => void;
  onRegisterUnsaved?: (api: { check: () => boolean; save: () => void } | null) => void;
}

export function NotesPanel({
  notes,
  videoTime,
  editingNoteId,
  showEditor,
  onAdd,
  onEdit,
  onSaveOnlyEdit,
  onSaveOnlyAdd,
  onDelete,
  onSetEditing,
  onSetShowEditor,
  onTimestampClick,
  onRegisterUnsaved,
}: NotesPanelProps) {
    const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {showEditor ? (
        <DetachableInlineEditor
          videoTime={videoTime}
          onSubmitAdd={onAdd}
          onSubmitEdit={(id, content, imagePaths) => {
            onEdit(id, content, imagePaths);
            onSetShowEditor(false);
          }}
          onSaveOnlyAdd={onSaveOnlyAdd}
          onSaveOnlyEdit={onSaveOnlyEdit}
          onCancel={() => onSetShowEditor(false)}
          onRegisterUnsaved={onRegisterUnsaved}
        />
      ) : (
        <button
          onClick={() => onSetShowEditor(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 font-sans text-xs text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
          style={{ transitionTimingFunction: SNAPPY }}
        >
          <NotePencil className="size-3.5" />
          {t("notesPanel.addANote")}
        </button>
      )}

      {notes.length === 0 && !showEditor && (
        <p className="py-4 text-center font-sans text-xs text-muted-foreground/60">
          {t("notesPanel.noNotes")}
        </p>
      )}

      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          videoTime={videoTime}
          isEditing={editingNoteId === note.id}
          onAdd={onAdd}
          onEdit={onEdit}
          onSaveOnlyAdd={onSaveOnlyAdd}
          onSaveOnlyEdit={onSaveOnlyEdit}
          onDelete={onDelete}
          onStartEdit={() => onSetEditing(note.id)}
          onCancelEdit={() => onSetEditing(null)}
          onTimestampClick={onTimestampClick}
          onRegisterUnsaved={onRegisterUnsaved}
        />
      ))}
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  videoTime: number;
  isEditing: boolean;
  onAdd: (content: string, imagePaths: string[]) => void;
  onEdit: (noteId: number, content: string, imagePaths: string[]) => void;
  onSaveOnlyAdd?: (content: string, imagePaths: string[]) => Promise<number | null>;
  onSaveOnlyEdit?: (noteId: number, content: string, imagePaths: string[]) => void | Promise<void>;
  onDelete: (noteId: number) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onTimestampClick?: (seconds: number, lessonId: number) => void;
  onRegisterUnsaved?: (api: { check: () => boolean; save: () => void } | null) => void;
}

function NoteCard({
  note,
  videoTime,
  isEditing,
  onAdd,
  onEdit,
  onSaveOnlyAdd,
  onSaveOnlyEdit,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onTimestampClick,
  onRegisterUnsaved,
}: NoteCardProps) {
  if (isEditing) {
    return (
      <DetachableInlineEditor
        videoTime={videoTime}
        initialNoteId={note.id}
        initialContent={note.content}
        initialImagePaths={note.imagePaths}
        onSubmitAdd={onAdd}
        onSubmitEdit={onEdit}
        onSaveOnlyAdd={onSaveOnlyAdd}
        onSaveOnlyEdit={onSaveOnlyEdit}
        onCancel={onCancelEdit}
        onRegisterUnsaved={onRegisterUnsaved}
      />
    );
  }

  const formatted = formatDateTime(note.updatedAt);

  return (
    <div
      className="group rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-secondary/50"
      style={{ transitionTimingFunction: SNAPPY }}
    >
      <CollapsibleImages
        imagePaths={note.imagePaths}
        className="mb-2"
      />
      <div className="mb-1.5 flex items-center gap-0.5">
        <button
          onClick={onStartEdit}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PencilSimple className="size-3" />
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash className="size-3" />
        </button>
      </div>

      <div
        ref={(el) => { if (el) highlightAllCodeBlocks(el); }}
        className="note-content font-sans text-xs leading-relaxed text-foreground/90"
        dangerouslySetInnerHTML={{ __html: note.content }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains("note-timestamp")) {
            const seconds = Number(target.dataset.timestamp);
            if (!isNaN(seconds) && onTimestampClick) {
              onTimestampClick(seconds, note.lessonId);
            }
          }
        }}
      />

      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {note.lessonTitle}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {formatted}
        </span>
      </div>
    </div>
  );
}

interface DetachableInlineEditorProps {
  videoTime: number;
  initialContent?: string;
  initialImagePaths?: string[];
  initialNoteId?: number | null;
  onSubmitAdd: (content: string, imagePaths: string[]) => void;
  onSubmitEdit: (noteId: number, content: string, imagePaths: string[]) => void;
  onSaveOnlyAdd?: (content: string, imagePaths: string[]) => Promise<number | null>;
  onSaveOnlyEdit?: (noteId: number, content: string, imagePaths: string[]) => void | Promise<void>;
  onCancel?: () => void;
  onRegisterUnsaved?: (api: { check: () => boolean; save: () => void } | null) => void;
}

function DetachableInlineEditor({
  videoTime,
  initialContent,
  initialImagePaths,
  initialNoteId = null,
  onSubmitAdd,
  onSubmitEdit,
  onSaveOnlyAdd,
  onSaveOnlyEdit,
  onCancel,
  onRegisterUnsaved,
}: DetachableInlineEditorProps) {
  const { t } = useTranslation();
  const { detached, pos, containerRef, handleDetach: toggleDetach, startDrag } = useDetachableWindow();
  const editorRef = useRef<NoteEditorHandle>(null);
  const [snapshot, setSnapshot] = useState<{ html: string; imagePaths: string[] } | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<number | null>(initialNoteId);

  const handleDetach = () => {
    const c = editorRef.current?.getContent();
    if (c) setSnapshot(c);
    toggleDetach();
  };

  const handleSubmit = (content: string, imagePaths: string[]) => {
    if (savedNoteId !== null) {
      onSubmitEdit(savedNoteId, content, imagePaths);
    } else {
      onSubmitAdd(content, imagePaths);
    }
  };

  const handleSaveOnly = async (content: string, imagePaths: string[]) => {
    if (savedNoteId !== null) {
      if (onSaveOnlyEdit) await onSaveOnlyEdit(savedNoteId, content, imagePaths);
    } else if (onSaveOnlyAdd) {
      const id = await onSaveOnlyAdd(content, imagePaths);
      if (id !== null) setSavedNoteId(id);
    }
  };

  const editor = (
    <NoteEditor
      ref={editorRef}
      videoTime={videoTime}
      initialContent={snapshot?.html ?? initialContent}
      initialImagePaths={snapshot?.imagePaths ?? initialImagePaths}
      onDetach={handleDetach}
      detached={detached}
      onSubmit={handleSubmit}
      onSaveOnly={handleSaveOnly}
      onCancel={onCancel}
      onRegisterUnsaved={onRegisterUnsaved}
    />
  );

  if (!detached) return editor;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed z-[60] flex flex-col rounded-lg border border-border bg-card shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: 480 }}
    >
      <div
        onMouseDown={startDrag}
        className="flex cursor-move select-none items-center gap-2 border-b border-border/50 px-3 py-1.5"
      >
        <NotePencil className="size-3.5 text-muted-foreground" weight="bold" />
        <span className="font-sans text-xs font-medium text-foreground">
          {t("noteEditor.floatingNote")}
        </span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onCancel}
          title={t("common.close")}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {editor}
    </div>,
    document.body,
  );
}
