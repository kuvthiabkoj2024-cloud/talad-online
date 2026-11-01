export interface CmsSection {
  id: string;
  title: string;
  level: 2 | 3;
  /** The section's content as HTML, without its heading. */
  html: string;
}

export interface CmsDocument {
  /** What comes before the first heading, as HTML. */
  intro: string;
  sections: CmsSection[];
}

export const isHtml = (body: string) => /<[a-z][\s\S]*>/i.test(body);

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const decodeHtml = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");

const textOf = (html: string) => decodeHtml(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Older pages: plain text with blank lines between paragraphs and "# " headings. */
function plainTextToHtml(text: string): string {
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${escapeHtml(para.join(" "))}</p>`);
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("# ")) {
      flush();
      out.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    } else para.push(line);
  }
  flush();
  return out.join("");
}

// Legal text pasted into the editor arrives as plain paragraphs: "ພາກທີ I: …" and "ຂໍ້ 1. …".
const PART = /^(?:ພາກທີ|Part)\s+[IVXLC\d]+\s*:/i;
const ARTICLE = /^(?:ຂໍ້|Article)\s*\d+\.(?!\d)/i;
const HEADING_MAX = 120;

function promoteHeadings(html: string): string {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner: string) => {
    const text = textOf(inner);
    if (text === "---") return "<hr>";
    if (text.length > HEADING_MAX) return whole;
    if (PART.test(text)) return `<h2>${escapeHtml(text)}</h2>`;
    if (ARTICLE.test(text)) return `<h3>${escapeHtml(text)}</h3>`;
    return whole;
  });
}

/** Dividers and empty paragraphs at the edges would only add gaps around a section. */
const trimEdges = (html: string) =>
  html
    .replace(/^(?:\s|<hr\s*\/?>|<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+/, "")
    .replace(/(?:\s|<hr\s*\/?>|<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+$/, "");

/** Splits a page body (editor HTML, cleaned by the API when saved, or older plain text) at its headings. */
export function parseCmsBody(body: string): CmsDocument {
  const heading = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>/g;
  // An empty heading adds nothing, and its content stays with the section before it.
  const html = promoteHeadings(isHtml(body) ? body : plainTextToHtml(body)).replace(heading, (whole, _tag, inner: string) => (textOf(inner) ? whole : ""));
  const matches = [...html.matchAll(heading)];
  const sections = matches.map((match, i): CmsSection => {
    const start = match.index + match[0].length;
    return {
      id: `section-${i + 1}`,
      title: textOf(match[2]),
      level: match[1] === "h2" ? 2 : 3,
      html: trimEdges(html.slice(start, matches[i + 1]?.index ?? html.length)),
    };
  });
  return { intro: trimEdges(html.slice(0, matches[0]?.index ?? html.length)), sections };
}
