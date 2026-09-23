import hljs from "highlight.js";

export interface CodeLanguage {
  id: string;
  label: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: "auto", label: "Auto" },
  { id: "plaintext", label: "Plain Text" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "rust", label: "Rust" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "bash", label: "Bash" },
  { id: "shell", label: "Shell" },
  { id: "sql", label: "SQL" },
  { id: "yaml", label: "YAML" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "xml", label: "XML" },
  { id: "diff", label: "Diff" },
  { id: "ini", label: "INI" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "lua", label: "Lua" },
  { id: "scala", label: "Scala" },
  { id: "perl", label: "Perl" },
  { id: "powershell", label: "PowerShell" },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(code: string, language: string): string {
  if (!language || language === "auto") {
    if (!code.trim()) return escapeHtml(code);
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  }
  const lang = hljs.getLanguage(language) ? language : "plaintext";
  if (lang === "plaintext") return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

export function getLanguageLabel(id: string): string {
  return CODE_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function highlightCodeElement(code: HTMLElement, language: string): void {
  const text = code.textContent ?? "";
  code.innerHTML = highlightCode(text, language);
  code.className = "hljs language-" + (language || "plaintext");
}

export function highlightAllCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll("pre.note-codeblock").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;
    const language = pre.getAttribute("data-language") || "plaintext";
    highlightCodeElement(code as HTMLElement, language);
  });
}

export function getCaretOffset(element: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  preRange.setEnd(range.endContainer, range.endOffset);
  const end = preRange.toString().length;
  return { start, end };
}

function findOffsetPosition(element: HTMLElement, offset: number): { node: Text; offset: number } | null {
  let charCount = 0;
  let result: { node: Text; offset: number } | null = null;
  function traverse(node: Node): void {
    if (result) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const nextCount = charCount + text.length;
      if (offset <= nextCount) {
        result = { node: node as Text, offset: Math.max(0, offset - charCount) };
        return;
      }
      charCount = nextCount;
    } else {
      for (const child of Array.from(node.childNodes)) traverse(child);
    }
  }
  traverse(element);
  return result;
}

export function setCaretOffsetRange(element: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const startPos = findOffsetPosition(element, start);
  const endPos = findOffsetPosition(element, end);
  if (startPos) {
    range.setStart(startPos.node, startPos.offset);
  } else {
    range.selectNodeContents(element);
    range.collapse(true);
  }
  if (endPos) {
    range.setEnd(endPos.node, endPos.offset);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
