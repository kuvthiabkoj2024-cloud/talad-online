import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { CategoriesPage } from '@/pages/categories'
import { DashboardPage } from '@/pages/dashboard'
import { NotFoundPage } from '@/pages/not-found'
import { PlaceholderPage } from '@/pages/placeholder'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'shops',
        element: <PlaceholderPage title="Shops" scopeRef="§2.3" />,
      },
      {
        path: 'customers',
        element: <PlaceholderPage title="Customers" scopeRef="§2.4" />,
      },
      {
        path: 'products',
        element: <PlaceholderPage title="Products" scopeRef="§2.5" />,
      },
      { path: 'categories', element: <CategoriesPage /> },
      {
        path: 'orders',
        element: <PlaceholderPage title="Orders" scopeRef="§3.6" />,
      },
      {
        path: 'delivery',
        element: <PlaceholderPage title="Delivery" scopeRef="§2.7" />,
      },
      {
        path: 'promotions',
        element: <PlaceholderPage title="Promotions" scopeRef="§2.8" />,
      },
      {
        path: 'disputes',
        element: <PlaceholderPage title="Disputes" scopeRef="§2.10" />,
      },
      {
        path: 'reports',
        element: <PlaceholderPage title="Reports" scopeRef="§2.9" />,
      },
      {
        path: 'cms',
        element: <PlaceholderPage title="Content" scopeRef="§2.11" />,
      },
      {
        path: 'settings',
        element: <PlaceholderPage title="Settings" scopeRef="§2.11" />,
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
