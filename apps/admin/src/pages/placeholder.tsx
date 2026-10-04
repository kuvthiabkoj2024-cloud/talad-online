import { PageHeader } from '@/components/page-header'

/** Stand-in for a section that has not been built yet. */
export function PlaceholderPage({
  title,
  scopeRef,
}: {
  title: string
  scopeRef: string
}) {
  return (
    <PageHeader
      title={title}
      description={`Not implemented yet — see ${scopeRef} in marketplace-project-scope.md.`}
    />
  )
}
