import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@talad/ui/components/card'
import { PageHeader } from '@/components/page-header'

const KPIS = [
  'Sales today',
  'Orders to ship',
  'Low-stock products',
  'Average rating',
]

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPIS.map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">—</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  )
}
