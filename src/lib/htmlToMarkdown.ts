export function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const result = convertNode(div);
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function convertNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replace(/\u00A0/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(convertNode).join("");

  switch (tag) {
    case "b":
    case "strong":
      return `**${children}**`;
    case "i":
    case "em":
      return `*${children}*`;
    case "s":
    case "strike":
    case "del":
      return `~~${children}~~`;
    case "u":
      return `<u>${children}</u>`;
    case "br":
      return "\n";
    case "div":
    case "p":
      return `\n${children}`;
    case "pre": {
      const codeEl = el.querySelector("code");
      const language = el.getAttribute("data-language") || "";
      const codeText = (codeEl ? codeEl.textContent : el.textContent) ?? "";
      const lang = language && language !== "plaintext" && language !== "auto" ? language : "";
      const body = codeText.replace(/\n+$/, "");
      return `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
    }
    case "code": {
      if (el.parentElement && el.parentElement.tagName.toLowerCase() === "pre") return children;
      return `\`${children}\``;
    }
    case "table": {
      const rows = Array.from(el.querySelectorAll("tr")) as HTMLTableRowElement[];
      if (rows.length === 0) return "";
      const parseRow = (tr: HTMLTableRowElement) =>
        Array.from(tr.querySelectorAll("th, td")).map((cell) =>
          (cell.textContent || "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || " "
        );
      const header = parseRow(rows[0]);
      const body = rows.slice(1).map(parseRow);
      const headerCells = Array.from(rows[0].querySelectorAll("th, td")) as HTMLTableCellElement[];
      const bodyRow = rows[1] ?? rows[0];
      const bodyCells = Array.from(bodyRow.querySelectorAll("th, td")) as HTMLTableCellElement[];
      const sep = headerCells.map((_, i) => {
        const align = (bodyCells[i]?.style.textAlign || "center").toLowerCase();
        if (align === "right") return "---:";
        if (align === "left") return ":---";
        return ":---:";
      });
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${sep.join(" | ")} |`,
        ...body.map((r) => `| ${r.join(" | ")} |`),
      ];
      return `\n${lines.join("\n")}\n`;
    }
    case "thead":
    case "tbody":
    case "tr":
    case "th":
    case "td":
      return children;
    default:
      return children;
  }
}
