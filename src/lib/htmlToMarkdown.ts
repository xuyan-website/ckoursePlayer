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
    default:
      return children;
  }
}
