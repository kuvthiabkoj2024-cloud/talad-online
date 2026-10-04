import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { DashboardPage } from '@/pages/dashboard'
import { NotFoundPage } from '@/pages/not-found'
import { PlaceholderPage } from '@/pages/placeholder'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'orders',
        element: <PlaceholderPage title="Orders" scopeRef="§3.6" />,
      },
      {
        path: 'products',
        element: <PlaceholderPage title="Products" scopeRef="§3.3" />,
      },
      {
        path: 'promotions',
        element: <PlaceholderPage title="Promotions" scopeRef="§3.4" />,
      },
      {
        path: 'customers',
        element: <PlaceholderPage title="Customers" scopeRef="§3.5" />,
      },
      {
        path: 'finance',
        element: <PlaceholderPage title="Finance" scopeRef="§3.7" />,
      },
      {
        path: 'reviews',
        element: <PlaceholderPage title="Reviews" scopeRef="§3.8" />,
      },
      {
        path: 'profile',
        element: <PlaceholderPage title="Shop profile" scopeRef="§3.2" />,
      },
      {
        path: 'security',
        element: <PlaceholderPage title="Security" scopeRef="§3.1" />,
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
