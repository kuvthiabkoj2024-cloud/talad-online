import sanitizeHtml from 'sanitize-html';

/** What the admin page editor can produce: headings, emphasis, lists, quotes, links. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'code'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    // Links open safely in a new tab.
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' } }),
  },
};

export const isHtml = (body: string) => /<[a-z][\s\S]*>/i.test(body);

/**
 * Cleans a page body from the editor: only the tags above survive (no scripts, styles or
 * event handlers). Older plain-text bodies are kept as they are.
 */
export function cleanPageBody(body: string): string {
  if (!isHtml(body)) return body;
  // Empty paragraphs the editor leaves at the end (from pressing Enter) are dropped.
  return sanitizeHtml(body, OPTIONS).trim().replace(/(?:<p>\s*<\/p>)+$/, '');
}
