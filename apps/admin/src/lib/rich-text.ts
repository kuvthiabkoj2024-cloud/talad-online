const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Older pages were plain text (blank lines between paragraphs, "# " headings): turned into
 * the same structure in HTML so the editor opens them properly.
 */
export function toEditorHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) return body
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .reduce<string[]>((out, line) => {
          if (line.startsWith('# ')) out.push(`<h2>${escape(line.slice(2))}</h2>`)
          else if (out.length && out[out.length - 1].startsWith('<p>')) out[out.length - 1] = out[out.length - 1].replace(/<\/p>$/, ` ${escape(line)}</p>`)
          else out.push(`<p>${escape(line)}</p>`)
          return out
        }, [])
        .join(''),
    )
    .join('')
}
