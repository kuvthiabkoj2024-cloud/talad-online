import { Link } from 'react-router'
import { Button } from '@talad/ui/components/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Page not found</p>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
