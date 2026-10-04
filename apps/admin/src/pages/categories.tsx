import { useQuery } from '@tanstack/react-query'
import { DEFAULT_LOCALE, type Locale } from '@talad/shared'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@talad/ui/components/table'
import { PageHeader } from '@/components/page-header'
import { api } from '@/lib/api'

interface CategoryNode {
  id: string
  slug: string
  name: Partial<Record<Locale, string>>
  children: CategoryNode[]
}

export function CategoriesPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryNode[]>('/categories'),
  })

  return (
    <>
      <PageHeader
        title="Categories"
        description="Category tree shown on the storefront (§2.6)."
      />
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Subcategories</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name[DEFAULT_LOCALE] ?? c.name.en}</TableCell>
                <TableCell className="font-mono text-xs">{c.slug}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.children.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
