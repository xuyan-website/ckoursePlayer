export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatVideoTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function parseTimeString(str: string): number | null {
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function buildTimestampHtml(seconds: number): string {
  const label = formatTimestamp(seconds);
  return `<span data-timestamp="${seconds}" contenteditable="false" class="note-timestamp">${label}</span>`;
}

export function extractFirstTimestamp(html: string): number | null {
  const match = /data-timestamp="(\d+(?:\.\d+)?)/.exec(html);
  if (!match) return null;
  const seconds = Number(match[1]);
  return isNaN(seconds) ? null : seconds;
}

const BLOCK_TAGS = new Set([
  "div", "p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "pre", "blockquote", "ul", "ol", "table", "tr", "section", "article",
]);

/**
 * Extract every timestamp marker in the note HTML together with the text that
 * follows it on the same line (within the same block container). Markers with
 * no following text are skipped. The text stops at the next block-level element,
 * a <br>, or the next timestamp marker.
 */
export function extractTimestampsWithFollowingText(
  html: string,
): { seconds: number; text: string }[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const result: { seconds: number; text: string }[] = [];

  for (const span of Array.from(container.querySelectorAll<HTMLSpanElement>("span[data-timestamp]"))) {
    const seconds = Number(span.getAttribute("data-timestamp"));
    if (isNaN(seconds)) continue;

    let text = "";
    let node: Node | null = span.nextSibling;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (BLOCK_TAGS.has(tag)) break;
        if (el.hasAttribute("data-timestamp")) break;
        text += el.textContent ?? "";
      } else if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? "";
      }
      node = node.nextSibling;
    }

    const trimmed = text.trim();
    if (trimmed) result.push({ seconds, text: trimmed });
  }

  return result;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
