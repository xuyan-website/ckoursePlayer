import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  PaperPlaneTiltIcon as PaperPlaneTilt,
  XIcon as X,
  TextBolderIcon as TextBolder,
  TextItalicIcon as TextItalic,
  TextUnderlineIcon as TextUnderline,
  TextStrikethroughIcon as TextStrikethrough,
  ClockIcon as Clock,
  TrashIcon as Trash,
  CameraIcon as Camera,
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowSquareInIcon as ArrowSquareIn,
  CodeIcon as Code,
  TableIcon as Table,
  PlusIcon as Plus,
  MinusIcon as Minus,
  TextAlignLeftIcon as TextAlignLeft,
  TextAlignCenterIcon as TextAlignCenter,
  TextAlignRightIcon as TextAlignRight,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { buildTimestampHtml, formatTimestamp, parseTimeString } from "@/lib/format";
import { copyImageToScreenshot, deleteFile } from "@/lib/store";
import { SNAPPY, EASE_OUT } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";
import {
  CODE_LANGUAGES,
  highlightCode,
  highlightAllCodeBlocks,
  getCaretOffset,
  setCaretOffsetRange,
  getLanguageLabel,
} from "@/lib/highlight";

// Matches @current or @m:ss / @h:mm:ss followed by a word boundary (space, end, punctuation)
const TIMESTAMP_COMMIT_RE = /@(current|\d{1,2}(?::\d{2}){1,2})(?=[\s,.\-!?;:]|$)/;

interface NoteEditorProps {
  videoTime: number;
  initialContent?: string;
  initialImagePaths?: string[];
  onSubmit: (content: string, imagePaths: string[]) => void;
  onCancel?: () => void;
  onDetach?: () => void;
  detached?: boolean;
  className?: string;
  onRegisterUnsaved?: (api: { check: () => boolean; save: () => void } | null) => void;
}

interface Suggestion {
  label: string;
  description: string;
  seconds: number;
}

export interface NoteEditorHandle {
  getContent: () => { html: string; imagePaths: string[] };
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor({
  videoTime,
  initialContent = "",
  initialImagePaths = [],
  onSubmit,
  onCancel,
  onDetach,
  detached = false,
  className,
  onRegisterUnsaved,
}: NoteEditorProps, ref) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const videoTimeRef = useRef(videoTime);
  const [imagePaths, setImagePaths] = useState<string[]>(initialImagePaths);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    getContent: () => ({
      html: editorRef.current?.innerHTML ?? "",
      imagePaths,
    }),
  }), [imagePaths]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    query: string;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const newImagePathsRef = useRef<string[]>([]);
  const isHighlightingRef = useRef(false);
  const isComposingRef = useRef(false);
  const [langMenu, setLangMenu] = useState<{
    mode: "insert" | "change";
    targetPre?: HTMLPreElement;
  } | null>(null);
  const [langQuery, setLangQuery] = useState("");
  const [codeToolbar, setCodeToolbar] = useState<{
    pre: HTMLPreElement;
    x: number;
    y: number;
    language: string;
  } | null>(null);
  const [tableDialog, setTableDialog] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableToolbar, setTableToolbar] = useState<{
    table: HTMLTableElement;
    x: number;
    y: number;
  } | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const codeUndoStackRef = useRef<{ text: string; caretStart: number; caretEnd: number }[]>([]);
  const codeRedoStackRef = useRef<{ text: string; caretStart: number; caretEnd: number }[]>([]);
  const codeHistoryCodeRef = useRef<HTMLElement | null>(null);

  const handlePickImage = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
        multiple: true,
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const p of paths) {
        if (typeof p !== "string") continue;
        const newPath = await copyImageToScreenshot(p);
        newImagePathsRef.current.push(newPath);
        setImagePaths((prev) => [...prev, newPath]);
      }
    } catch (err) {
      console.error("pick image failed", err);
    }
  }, []);

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    for (const cmd of ["bold", "italic", "underline", "strikeThrough"]) {
      if (document.queryCommandState(cmd)) formats.add(cmd);
    }
    setActiveFormats(formats);
  }, []);

  useEffect(() => {
    videoTimeRef.current = videoTime;
  }, [videoTime]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (initialContent) {
      el.innerHTML = initialContent;
      highlightAllCodeBlocks(el);
    } else {
      // Auto-insert current video time timestamp when opening a new note
      el.innerHTML = "<div>" + buildTimestampHtml(videoTimeRef.current) + "</div><div><br></div>";
    }
    el.focus();
    // Place cursor at the end of the content
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const cleanupEmptyCodeBlocks = useCallback((skipCurrent: boolean) => {
    const el = editorRef.current;
    if (!el) return;
    const currentCode = getCurrentCodeElement();
    el.querySelectorAll("pre.note-codeblock").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;
      const isCurrent = !!currentCode && code === currentCode;
      if (skipCurrent && isCurrent) return;
      const text = code.textContent ?? "";
      if (!text.trim()) {
        const next = pre.nextElementSibling;
        pre.remove();
        if (isCurrent && next) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(next);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    });
  }, []);

  const saveCodeSnapshot = useCallback(() => {
    const code = getCurrentCodeElement();
    if (!code) return;
    if (codeHistoryCodeRef.current !== code) {
      codeUndoStackRef.current = [];
      codeRedoStackRef.current = [];
      codeHistoryCodeRef.current = code;
    }
    const text = code.textContent ?? "";
    const { start, end } = getCaretOffset(code);
    codeUndoStackRef.current.push({ text, caretStart: start, caretEnd: end });
    if (codeUndoStackRef.current.length > 100) {
      codeUndoStackRef.current.shift();
    }
    codeRedoStackRef.current = [];
  }, []);

  function undoCodeBlock(): boolean {
    const code = getCurrentCodeElement();
    if (!code || codeHistoryCodeRef.current !== code) return false;
    if (codeUndoStackRef.current.length === 0) return false;
    const currentText = code.textContent ?? "";
    const { start, end } = getCaretOffset(code);
    codeRedoStackRef.current.push({ text: currentText, caretStart: start, caretEnd: end });
    const snapshot = codeUndoStackRef.current.pop()!;
    const pre = code.parentElement;
    const language = pre?.getAttribute("data-language") || "plaintext";
    isHighlightingRef.current = true;
    code.innerHTML = highlightCode(snapshot.text, language) || "<br>";
    code.className = "hljs language-" + language;
    setCaretOffsetRange(code, snapshot.caretStart, snapshot.caretEnd);
    isHighlightingRef.current = false;
    return true;
  }

  function redoCodeBlock(): boolean {
    const code = getCurrentCodeElement();
    if (!code || codeHistoryCodeRef.current !== code) return false;
    if (codeRedoStackRef.current.length === 0) return false;
    const currentText = code.textContent ?? "";
    const { start, end } = getCaretOffset(code);
    codeUndoStackRef.current.push({ text: currentText, caretStart: start, caretEnd: end });
    const snapshot = codeRedoStackRef.current.pop()!;
    const pre = code.parentElement;
    const language = pre?.getAttribute("data-language") || "plaintext";
    isHighlightingRef.current = true;
    code.innerHTML = highlightCode(snapshot.text, language) || "<br>";
    code.className = "hljs language-" + language;
    setCaretOffsetRange(code, snapshot.caretStart, snapshot.caretEnd);
    isHighlightingRef.current = false;
    return true;
  }

  useEffect(() => {
    const handler = () => {
      if (editorRef.current?.contains(document.activeElement) || editorRef.current === document.activeElement) {
        updateActiveFormats();
        updateCodeToolbar();
        updateTableToolbar();
        cleanupEmptyCodeBlocks(true);
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [updateActiveFormats, cleanupEmptyCodeBlocks]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      if (isComposingRef.current) return;
      const code = getCurrentCodeElement();
      if (!code) return;
      const t = e.inputType;
      if (
        t === "insertText" ||
        t === "insertReplacementText" ||
        t === "insertFromPaste" ||
        t === "deleteContentBackward" ||
        t === "deleteContentForward" ||
        t === "deleteByCut"
      ) {
        saveCodeSnapshot();
      }
    };
    el.addEventListener("beforeinput", onBeforeInput as EventListener);
    return () => el.removeEventListener("beforeinput", onBeforeInput as EventListener);
  }, [saveCodeSnapshot]);

  const isEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return true;
    return !el.textContent?.trim();
  }, []);

  function execFormat(command: string) {
    document.execCommand(command, false);
    editorRef.current?.focus();
    updateActiveFormats();
  }

  function getCurrentCodeElement(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    const root = editorRef.current;
    while (node && node !== root) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "CODE") {
        const parent = node.parentElement;
        if (parent && parent.tagName === "PRE" && parent.classList.contains("note-codeblock")) {
          return node as HTMLElement;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  function updateCodeToolbar() {
    const code = getCurrentCodeElement();
    if (!code || !code.parentElement) {
      setCodeToolbar(null);
      return;
    }
    const pre = code.parentElement as HTMLPreElement;
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) {
      setCodeToolbar(null);
      return;
    }
    const preRect = pre.getBoundingClientRect();
    const language = pre.getAttribute("data-language") || "auto";
    setCodeToolbar({ pre, x: preRect.left - editorRect.left, y: preRect.top - editorRect.top, language });
  }

  function highlightCurrentCodeBlock() {
    if (isHighlightingRef.current) return;
    const code = getCurrentCodeElement();
    if (!code) return;
    const pre = code.parentElement;
    if (!pre) return;
    const language = pre.getAttribute("data-language") || "plaintext";

    isHighlightingRef.current = true;
    const { start, end } = getCaretOffset(code);
    const text = code.textContent ?? "";
    code.innerHTML = highlightCode(text, language);
    code.className = "hljs language-" + language;
    setCaretOffsetRange(code, start, end);
    isHighlightingRef.current = false;
  }

  function insertCodeBlock(language: string) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const pre = document.createElement("pre");
    pre.className = "note-codeblock";
    pre.setAttribute("data-language", language);

    const code = document.createElement("code");
    code.className = "hljs language-" + language;
    code.innerHTML = "<br>";
    pre.appendChild(code);
    range.insertNode(pre);

    const after = document.createElement("div");
    after.innerHTML = "<br>";
    pre.after(after);

    const newRange = document.createRange();
    newRange.setStart(code, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    editorRef.current?.focus();
    setLangMenu(null);
    updateCodeToolbar();
  }

  function getCurrentCell(): HTMLTableCellElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    const root = editorRef.current;
    while (node && node !== root) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "TD" || el.tagName === "TH") {
          return el as HTMLTableCellElement;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  function placeCaretInCell(cell: HTMLTableCellElement, atEnd: boolean) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
    cell.focus();
  }

  function insertTable(rows: number, cols: number) {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    let range: Range;
    if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).startContainer)) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current && editor.contains(savedRangeRef.current.startContainer)) {
      range = savedRangeRef.current;
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();

    const table = document.createElement("table");
    table.className = "note-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const th = document.createElement("th");
      th.innerHTML = "<br>";
      th.style.textAlign = "center";
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let r = 1; r < rows; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    range.insertNode(table);

    const after = document.createElement("div");
    after.innerHTML = "<br>";
    table.after(after);

    const firstTh = table.querySelector("th");
    if (firstTh) {
      const newRange = document.createRange();
      newRange.setStart(firstTh, 0);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    }

    editor.focus();
    setTableDialog(false);
    updateTableToolbar();
  }

  function addTableRow() {
    const cell = getCurrentCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const currentTr = cell.parentElement as HTMLTableRowElement;
    const colCount = currentTr.querySelectorAll("th, td").length;
    const newTr = document.createElement("tr");
    for (let c = 0; c < colCount; c++) {
      const td = document.createElement("td");
      td.innerHTML = "<br>";
      newTr.appendChild(td);
    }
    if (currentTr.parentElement?.tagName === "THEAD") {
      let tbody = table.querySelector("tbody");
      if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
      }
      tbody.insertBefore(newTr, tbody.firstChild);
    } else {
      currentTr.after(newTr);
    }
    placeCaretInCell(newTr.firstElementChild as HTMLTableCellElement, false);
    editorRef.current?.focus();
  }

  function addTableCol() {
    const cell = getCurrentCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const currentTr = cell.parentElement as HTMLTableRowElement;
    const cells = Array.from(currentTr.querySelectorAll("th, td")) as HTMLTableCellElement[];
    const colIdx = cells.indexOf(cell);
    table.querySelectorAll("tr").forEach((tr) => {
      const trCells = Array.from(tr.querySelectorAll("th, td")) as HTMLTableCellElement[];
      const ref = trCells[colIdx];
      if (!ref) return;
      const isHead = tr.parentElement?.tagName === "THEAD";
      const newCell = document.createElement(isHead ? "th" : "td");
      newCell.innerHTML = "<br>";
      ref.after(newCell);
    });
    placeCaretInCell(cell.nextElementSibling as HTMLTableCellElement, false);
    editorRef.current?.focus();
  }

  function deleteTableRow() {
    const cell = getCurrentCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const currentTr = cell.parentElement as HTMLTableRowElement;
    const isInHead = currentTr.parentElement?.tagName === "THEAD";
    const tbody = table.querySelector("tbody");
    if (isInHead) {
      if (tbody && tbody.firstElementChild) {
        const firstBodyRow = tbody.firstElementChild as HTMLTableRowElement;
        firstBodyRow.querySelectorAll("td").forEach((td) => {
          const th = document.createElement("th");
          th.innerHTML = td.innerHTML;
          td.replaceWith(th);
        });
        currentTr.remove();
        table.querySelector("thead")!.appendChild(firstBodyRow);
      } else {
        deleteTable();
        return;
      }
    } else {
      currentTr.remove();
      if (!tbody || !tbody.firstElementChild) {
        deleteTable();
        return;
      }
    }
    editorRef.current?.focus();
  }

  function deleteTableCol() {
    const cell = getCurrentCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const currentTr = cell.parentElement as HTMLTableRowElement;
    const cells = Array.from(currentTr.querySelectorAll("th, td")) as HTMLTableCellElement[];
    const colIdx = cells.indexOf(cell);
    if (cells.length <= 1) {
      deleteTable();
      return;
    }
    table.querySelectorAll("tr").forEach((tr) => {
      const trCells = Array.from(tr.querySelectorAll("th, td")) as HTMLTableCellElement[];
      trCells[colIdx]?.remove();
    });
    const remaining = Array.from(currentTr.querySelectorAll("th, td")) as HTMLTableCellElement[];
    const newCell = remaining[Math.min(colIdx, remaining.length - 1)];
    if (newCell) placeCaretInCell(newCell, false);
    editorRef.current?.focus();
  }

  function deleteTable() {
    const cell = getCurrentCell();
    const table = (cell?.closest("table") as HTMLTableElement | null) ?? tableToolbar?.table;
    if (!table) return;
    const next = table.nextElementSibling;
    table.remove();
    if (next) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(next);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setTableToolbar(null);
    editorRef.current?.focus();
  }

  function setColumnAlign(align: "left" | "center" | "right") {
    const cell = getCurrentCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const currentTr = cell.parentElement as HTMLTableRowElement;
    const cells = Array.from(currentTr.querySelectorAll("th, td")) as HTMLTableCellElement[];
    const colIdx = cells.indexOf(cell);
    table.querySelectorAll("tr").forEach((tr) => {
      const trCells = Array.from(tr.querySelectorAll("th, td")) as HTMLTableCellElement[];
      if (trCells[colIdx] && trCells[colIdx].tagName === "TD") {
        trCells[colIdx].style.textAlign = align;
      }
    });
    editorRef.current?.focus();
  }

  function updateTableToolbar() {
    const cell = getCurrentCell();
    if (!cell) {
      setTableToolbar(null);
      return;
    }
    const table = cell.closest("table") as HTMLTableElement | null;
    if (!table || !table.classList.contains("note-table")) {
      setTableToolbar(null);
      return;
    }
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) {
      setTableToolbar(null);
      return;
    }
    const tableRect = table.getBoundingClientRect();
    setTableToolbar({ table, x: tableRect.left - editorRect.left, y: tableRect.top - editorRect.top });
  }

  function changeCodeBlockLanguage(pre: HTMLPreElement, language: string) {
    const editor = editorRef.current;
    const savedScrollTop = editor?.scrollTop ?? 0;
    pre.setAttribute("data-language", language);
    const code = pre.querySelector("code");
    if (code) {
      const codeEl = code as HTMLElement;
      const text = codeEl.textContent ?? "";
      codeEl.innerHTML = highlightCode(text, language) || "<br>";
      codeEl.className = "hljs language-" + language;
    }
    setLangMenu(null);
    editor?.focus({ preventScroll: true });
    if (code) {
      const codeEl = code as HTMLElement;
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    if (editor) editor.scrollTop = savedScrollTop;
    const editorRect = editor?.getBoundingClientRect();
    const preRect = pre.getBoundingClientRect();
    if (editorRect) {
      setCodeToolbar({ pre, x: preRect.left - editorRect.left, y: preRect.top - editorRect.top, language });
    }
  }

  function handleCodeBlockButton(e: React.MouseEvent) {
    e.preventDefault();
    editorRef.current?.focus();
    if (getCurrentCodeElement()) return;
    insertCodeBlock("auto");
  }

  function handleLangSelect(language: string) {
    if (langMenu?.mode === "change" && langMenu.targetPre) {
      changeCodeBlockLanguage(langMenu.targetPre, language);
    } else {
      insertCodeBlock(language);
    }
  }

  // Get the @... query text behind cursor, if any
  function getAtQuery(): { text: string; node: Text; start: number; end: number } | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent ?? "";
    const cursor = range.startOffset;

    // Walk backwards from cursor to find @
    let atPos = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (text[i] === "@") {
        atPos = i;
        break;
      }
      // Stop if we hit a space before finding @
      if (text[i] === " " || text[i] === "\u00A0") break;
    }

    if (atPos === -1) return null;
    const query = text.slice(atPos + 1, cursor);
    return { text: query, node: node as Text, start: atPos, end: cursor };
  }

  // Build suggestions based on current query
  function getSuggestions(query: string): Suggestion[] {
    const time = videoTimeRef.current;
    const currentLabel = formatTimestamp(time);
    const suggestions: Suggestion[] = [];

    // Always offer "current" if query is prefix of "current" or empty
    if ("current".startsWith(query.toLowerCase()) || query === "") {
      suggestions.push({
        label: `@${currentLabel}`,
        description: "Current time",
        seconds: time,
      });
    }

    // If query looks like a partial time (digits and colons), offer it as typed
    if (query && /^\d{1,2}(:\d{0,2}){0,2}$/.test(query)) {
      const parsed = parseTimeString(query);
      if (parsed !== null && parsed !== time) {
        suggestions.push({
          label: `@${formatTimestamp(parsed)}`,
          description: "Go to time",
          seconds: parsed,
        });
      }
    }

    return suggestions;
  }

  function replaceAtQuery(seconds: number) {
    const atq = getAtQuery();
    if (!atq) return;

    const { node, start, end } = atq;
    const html = buildTimestampHtml(seconds);

    const replaceRange = document.createRange();
    replaceRange.setStart(node, start);
    replaceRange.setEnd(node, end);
    replaceRange.deleteContents();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    replaceRange.insertNode(wrapper);

    const sel = window.getSelection();
    const newRange = document.createRange();
    newRange.setStartAfter(wrapper);
    newRange.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(newRange);

    setMenu(null);
  }

  // Try to commit a completed timestamp pattern (e.g. after space)
  function tryCommitTimestamp() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const node = sel.getRangeAt(0).startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent ?? "";
    const match = TIMESTAMP_COMMIT_RE.exec(text);
    if (!match) return false;

    const raw = match[1];
    let seconds: number;
    if (raw === "current") {
      seconds = videoTimeRef.current;
    } else {
      const parsed = parseTimeString(raw);
      if (parsed === null) return false;
      seconds = parsed;
    }

    const html = buildTimestampHtml(seconds);
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    const replaceRange = document.createRange();
    replaceRange.setStart(node, matchStart);
    replaceRange.setEnd(node, matchEnd);
    replaceRange.deleteContents();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    replaceRange.insertNode(wrapper);

    const newRange = document.createRange();
    newRange.setStartAfter(wrapper);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMenu(null);
    return true;
  }

  function updateMenu() {
    const atq = getAtQuery();
    if (!atq) {
      setMenu(null);
      return;
    }

    // Position the menu at the cursor
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) return;

    setMenu({
      x: rect.left - editorRect.left,
      y: rect.bottom - editorRect.top + 4,
      query: atq.text,
    });
    setSelectedIndex(0);
  }

  function handleInput() {
    if (isComposingRef.current) return;
    highlightCurrentCodeBlock();
    cleanupEmptyCodeBlocks(false);
    // First try to auto-commit completed patterns (after space/punctuation)
    if (tryCommitTimestamp()) return;
    updateMenu();
    updateActiveFormats();
  }

  function handleSubmit() {
    if (isEmpty()) return;
    const html = editorRef.current?.innerHTML ?? "";
    onSubmit(html, imagePaths);
    newImagePathsRef.current = [];
    if (editorRef.current) editorRef.current.innerHTML = "";
    setMenu(null);
  }

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    onRegisterUnsaved?.({
      check: () => !isEmpty(),
      save: () => handleSubmitRef.current(),
    });
    return () => onRegisterUnsaved?.(null);
  }, [onRegisterUnsaved, isEmpty]);

  const handleCancel = useCallback(async () => {
    const newPaths = newImagePathsRef.current;
    await Promise.allSettled(newPaths.map((p) => deleteFile(p)));
    newImagePathsRef.current = [];
    onCancel?.();
  }, [onCancel]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // Menu navigation
    if (menu) {
      const suggestions = getSuggestions(menu.query);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (suggestions.length > 0) {
          e.preventDefault();
          replaceAtQuery(suggestions[selectedIndex]?.seconds ?? suggestions[0].seconds);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      const currentCode = getCurrentCodeElement();
      if (currentCode) {
        e.preventDefault();
        if (e.shiftKey) {
          redoCodeBlock();
        } else {
          undoCodeBlock();
        }
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "y") {
      const currentCode = getCurrentCodeElement();
      if (currentCode) {
        e.preventDefault();
        redoCodeBlock();
        return;
      }
    }

    if (e.key === "Tab") {
      const cell = getCurrentCell();
      if (cell) {
        const table = cell.closest("table") as HTMLTableElement | null;
        if (table) {
          e.preventDefault();
          const allCells = Array.from(table.querySelectorAll("th, td")) as HTMLTableCellElement[];
          const idx = allCells.indexOf(cell);
          if (e.shiftKey) {
            const prev = allCells[idx - 1];
            if (prev) placeCaretInCell(prev, true);
          } else {
            const next = allCells[idx + 1];
            if (next) placeCaretInCell(next, false);
          }
          return;
        }
      }
      e.preventDefault();
      document.execCommand("insertText", false, "    ");
      return;
    }

    if (e.key === "Enter" && e.altKey) {
      const cell = getCurrentCell();
      if (cell) {
        e.preventDefault();
        addTableRow();
        return;
      }
    }

    // Inside code block: Enter inserts a newline instead of a new block
    if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
      const currentCode = getCurrentCodeElement();
      if (currentCode) {
        e.preventDefault();
        saveCodeSnapshot();
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode("\n");
          range.insertNode(textNode);
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        highlightCurrentCodeBlock();
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && onCancel && !menu) {
      handleCancel();
    }
  }

  const suggestions = menu ? getSuggestions(menu.query) : [];

  const toolbarButtons = [
    { command: "bold", icon: TextBolder, label: t("noteEditor.bold") },
    { command: "italic", icon: TextItalic, label: t("noteEditor.italic") },
    { command: "underline", icon: TextUnderline, label: t("noteEditor.underline") },
    { command: "strikeThrough", icon: TextStrikethrough, label: t("noteEditor.strikethrough") },
  ];

  return (
    <div className={cn("relative rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center gap-0.5 border-b border-border/50 px-2 py-1.5">
        {toolbarButtons.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat(command);
            }}
            title={label}
            className={cn(
              "rounded p-1 transition-colors",
              activeFormats.has(command)
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        ))}

        <button
          onMouseDown={handleCodeBlockButton}
          title={t("noteEditor.codeBlock")}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Code className="size-3.5" />
        </button>

        <button
          onMouseDown={(e) => {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              savedRangeRef.current = sel.getRangeAt(0).cloneRange();
            }
            setTableDialog(true);
          }}
          title={t("noteEditor.table")}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Table className="size-3.5" />
        </button>

        <span className="ml-2 font-mono text-[10px] text-muted-foreground/40">
          {t("noteEditor.type")} <span className="text-muted-foreground/60">@</span> {t("noteEditor.toTagTime")}
        </span>

        {onDetach && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDetach}
            title={detached ? t("noteEditor.dock") : t("noteEditor.detach")}
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {detached ? (
              <ArrowSquareIn className="size-3.5" />
            ) : (
              <ArrowSquareOut className="size-3.5" />
            )}
            <span className="font-sans text-[10px]">
              {detached ? t("noteEditor.dock") : t("noteEditor.detach")}
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-b border-border/50 px-2 py-1.5">
        {imagePaths.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {imagePaths.map((path, idx) => (
              <div key={idx} className="group/img relative overflow-hidden rounded-md border border-border/50">
                <img
                  src={convertFileSrc(path)}
                  className="h-20 w-full cursor-zoom-in object-cover"
                  onClick={() => setLightboxIndex(idx)}
                  alt={`note-image-${idx}`}
                />
                <button
                  onClick={() => setImagePaths((prev) => prev.filter((_, i) => i !== idx))}
                  title={t("noteEditor.removeImage")}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-red-500/80"
                >
                  <Trash className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={handlePickImage}
          className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Camera className="size-3.5" />
          {t("noteEditor.addImage")}
        </button>
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={() => cleanupEmptyCodeBlocks(false)}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            highlightCurrentCodeBlock();
            updateActiveFormats();
          }}
          data-placeholder={t("notesPanel.writeANote")}
          className="note-editable max-h-60 min-h-18 w-full overflow-x-hidden overflow-y-auto px-3 pt-2.5 pb-2 font-sans text-xs leading-relaxed text-foreground focus:outline-none"
        />

        {codeToolbar && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setLangMenu({
                mode: "change",
                targetPre: codeToolbar.pre,
              });
              setLangQuery("");
            }}
            className="absolute z-20 flex items-center gap-1 rounded bg-[#ffffff] px-2.5 py-0.5 font-mono text-[10px] text-[#8b949e] shadow-sm transition-colors hover:text-[#000000]"
            style={{ left: 10, bottom:-30}}
          >
            {getLanguageLabel(codeToolbar.language)}
          </button>
        )}

        {tableToolbar && (
          <div
            className="absolute z-20 flex items-center gap-0.5 rounded bg-[#ffffff] p-0.5 shadow-sm"
            style={{ left: tableToolbar.x, top: tableToolbar.y - 22 }}
          >
            <button
              onMouseDown={(e) => { e.preventDefault(); addTableRow(); }}
              title={t("noteEditor.addRow")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <Plus className="size-3" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); addTableCol(); }}
              title={t("noteEditor.addCol")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <Plus className="size-3 rotate-90" />
            </button>
            <span className="mx-0.5 h-3 w-px bg-[#d0d7de]" />
            <button
              onMouseDown={(e) => { e.preventDefault(); deleteTableRow(); }}
              title={t("noteEditor.deleteRow")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <Minus className="size-3" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); deleteTableCol(); }}
              title={t("noteEditor.deleteCol")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <Minus className="size-3 rotate-90" />
            </button>
            <span className="mx-0.5 h-3 w-px bg-[#d0d7de]" />
            <button
              onMouseDown={(e) => { e.preventDefault(); setColumnAlign("left"); }}
              title={t("noteEditor.alignLeft")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <TextAlignLeft className="size-3" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setColumnAlign("center"); }}
              title={t("noteEditor.alignCenter")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <TextAlignCenter className="size-3" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setColumnAlign("right"); }}
              title={t("noteEditor.alignRight")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-[#000000]"
            >
              <TextAlignRight className="size-3" />
            </button>
            <span className="mx-0.5 h-3 w-px bg-[#d0d7de]" />
            <button
              onMouseDown={(e) => { e.preventDefault(); deleteTable(); }}
              title={t("noteEditor.deleteTable")}
              className="rounded p-0.5 text-[#8b949e] transition-colors hover:text-red-500"
            >
              <Trash className="size-3" />
            </button>
          </div>
        )}

        {menu && suggestions.length > 0 && (
          <div
            ref={menuRef}
            className="absolute z-10 min-w-45 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            style={{
              left: menu.x,
              top: menu.y,
              opacity: 1,
              transform: "translateY(0)",
              transition: `opacity 200ms ${EASE_OUT}, transform 200ms ${EASE_OUT}`,
            }}
          >
            {suggestions.map((s, i) => (
              <button
                key={s.seconds}
                onMouseDown={(e) => {
                  e.preventDefault();
                  replaceAtQuery(s.seconds);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  i === selectedIndex
                    ? "bg-secondary"
                    : "hover:bg-secondary/50"
                )}
              >
                <Clock className="size-3.5 shrink-0 text-primary" />
                <span className="font-mono text-[11px] font-semibold text-foreground">
                  {s.label}
                </span>
                <span className="ml-auto font-sans text-[10px] text-muted-foreground">
                  {s.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative flex items-center justify-end gap-1.5 border-t border-border/50 px-3 py-1.5">
        {langMenu && (
          <div className="absolute bottom-full left-3 z-50 max-h-60 w-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            <div className="sticky top-0 border-b border-border/50 bg-card px-2 py-1.5">
              <input
                autoFocus
                value={langQuery}
                onChange={(e) => setLangQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setLangMenu(null);
                  }
                }}
                placeholder={t("noteEditor.searchLanguage")}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            {CODE_LANGUAGES.filter(
              (l) =>
                l.label.toLowerCase().includes(langQuery.toLowerCase()) ||
                l.id.toLowerCase().includes(langQuery.toLowerCase()),
            ).map((lang) => (
              <button
                key={lang.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleLangSelect(lang.id);
                }}
                className="flex w-full items-center px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary"
              >
                {lang.label}
              </button>
            ))}
          </div>
        )}
        {onCancel && (
          <button
            onClick={handleCancel}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          style={{ transitionTimingFunction: SNAPPY }}
        >
          <PaperPlaneTilt className="size-3.5" weight="fill" />
          {t("common.save")}
        </button>
      </div>

      {tableDialog && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/20"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTableDialog(false); }}
        >
          <div
            className="rounded-lg border border-border bg-card p-4 shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-xs font-medium text-foreground">{t("noteEditor.insertTable")}</div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("noteEditor.rows")}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("noteEditor.cols")}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                onClick={() => setTableDialog(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTable(tableRows, tableCols)}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {langMenu && (
        <div className="absolute inset-0 z-40" onMouseDown={() => setLangMenu(null)} />
      )}

      {lightboxIndex !== null && imagePaths[lightboxIndex] && (
        <ImageLightbox src={convertFileSrc(imagePaths[lightboxIndex])} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
});
