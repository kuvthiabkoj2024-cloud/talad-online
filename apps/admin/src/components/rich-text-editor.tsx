import { Button } from '@talad/ui/components/button'
import { cn } from '@talad/ui/lib/utils'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '@/i18n/context'
import { toEditorHtml } from '@/lib/rich-text'

/** A rich text editor (headings, emphasis, lists, quotes, links) that reads and writes HTML. */
export function RichTextEditor({ id, value, onChange, className }: { id?: string; value: string; onChange: (html: string) => void; className?: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } })],
    content: toEditorHtml(value),
    // Re-render on every change so the toolbar shows what's active at the cursor.
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { ...(id && { id }), class: 'rich-text min-h-72 px-4 py-3 outline-none' } },
    // An empty document is saved as "" (not "<p></p>").
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  })

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30', className)}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const e = t.editor
  const chain = () => editor.chain().focus()

  const setLink = () => {
    const current = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(e.linkPrompt, current ?? 'https://')
    if (url === null) return
    if (!url.trim() || url.trim() === 'https://') chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const groups: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; run: () => void }[][] = [
    [
      { icon: Pilcrow, label: e.paragraph, active: editor.isActive('paragraph'), run: () => chain().setParagraph().run() },
      { icon: Heading2, label: e.heading, active: editor.isActive('heading', { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
      { icon: Heading3, label: e.subheading, active: editor.isActive('heading', { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { icon: Bold, label: e.bold, active: editor.isActive('bold'), run: () => chain().toggleBold().run() },
      { icon: Italic, label: e.italic, active: editor.isActive('italic'), run: () => chain().toggleItalic().run() },
      { icon: Underline, label: e.underline, active: editor.isActive('underline'), run: () => chain().toggleUnderline().run() },
      { icon: Strikethrough, label: e.strike, active: editor.isActive('strike'), run: () => chain().toggleStrike().run() },
    ],
    [
      { icon: List, label: e.bulletList, active: editor.isActive('bulletList'), run: () => chain().toggleBulletList().run() },
      { icon: ListOrdered, label: e.orderedList, active: editor.isActive('orderedList'), run: () => chain().toggleOrderedList().run() },
      { icon: Quote, label: e.quote, active: editor.isActive('blockquote'), run: () => chain().toggleBlockquote().run() },
      { icon: Minus, label: e.divider, run: () => chain().setHorizontalRule().run() },
    ],
    [
      { icon: Link2, label: e.link, active: editor.isActive('link'), run: setLink },
      { icon: Link2Off, label: e.unlink, disabled: !editor.isActive('link'), run: () => chain().extendMarkRange('link').unsetLink().run() },
    ],
    [
      { icon: Undo2, label: e.undo, disabled: !editor.can().undo(), run: () => chain().undo().run() },
      { icon: Redo2, label: e.redo, disabled: !editor.can().redo(), run: () => chain().redo().run() },
    ],
  ]

  return (
    <div role="toolbar" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
      {groups.map((group, i) => (
        <span key={i} className="flex items-center gap-0.5 not-last:mr-1 not-last:border-r not-last:pr-1">
          {group.map(({ icon: Icon, label, active, disabled, run }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon-sm"
              title={label}
              aria-label={label}
              aria-pressed={active}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={run}
              className={cn(active && 'bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary')}
            >
              <Icon />
            </Button>
          ))}
        </span>
      ))}
    </div>
  )
}
