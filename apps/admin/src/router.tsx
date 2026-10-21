import type { AdminPermission } from '@talad/shared'
import { createBrowserRouter, redirect } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { RequireAdmin, RequireArea } from '@/components/require-admin'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'

/** A lazy route whose page needs the `area` permission (none = Super Admin only). */
const page =
  <M,>(load: () => Promise<M>, pick: (m: M) => React.ComponentType, area?: AdminPermission) =>
  () =>
    load().then((m) => {
      const Page = pick(m)
      return {
        Component: () => (
          <RequireArea area={area}>
            <Page />
          </RequireArea>
        ),
      }
    })

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', lazy: () => import('@/pages/reset-password').then((m) => ({ Component: m.ForgotPasswordPage })) },
  { path: '/reset-password', lazy: () => import('@/pages/reset-password').then((m) => ({ Component: m.ResetPasswordPage })) },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: (
              <RequireArea area="dashboard">
                <DashboardPage />
              </RequireArea>
            ),
          },
          { path: 'reports', lazy: page(() => import('@/pages/reports'), (m) => m.ReportsPage, 'reports') },
          { path: 'shops', lazy: page(() => import('@/pages/shops'), (m) => m.ShopsPage, 'shops') },
          { path: 'shops/:id', lazy: page(() => import('@/pages/shops'), (m) => m.ShopDetailPage, 'shops') },
          { path: 'products', lazy: page(() => import('@/pages/products'), (m) => m.ProductsPage, 'products') },
          { path: 'products/:id', lazy: page(() => import('@/pages/products'), (m) => m.ProductDetailPage, 'products') },
          { path: 'customers', lazy: page(() => import('@/pages/customers'), (m) => m.CustomersPage, 'customers') },
          { path: 'customers/:id', lazy: page(() => import('@/pages/customers'), (m) => m.CustomerDetailPage, 'customers') },
          { path: 'orders', lazy: page(() => import('@/pages/orders'), (m) => m.OrdersPage, 'orders') },
          { path: 'orders/:number', lazy: page(() => import('@/pages/orders'), (m) => m.OrderDetailPage, 'orders') },
          { path: 'disputes', lazy: page(() => import('@/pages/money'), (m) => m.DisputesPage, 'disputes') },
          { path: 'payouts', lazy: page(() => import('@/pages/money'), (m) => m.PayoutsPage, 'payouts') },
          { path: 'coupons', lazy: page(() => import('@/pages/coupons'), (m) => m.CouponsPage, 'coupons') },
          { path: 'categories', lazy: page(() => import('@/pages/catalog'), (m) => m.CategoriesPage, 'catalog') },
          { path: 'units', lazy: page(() => import('@/pages/catalog'), (m) => m.UnitsPage, 'catalog') },
          // The old combined page.
          { path: 'catalog', loader: () => redirect('/categories') },
          { path: 'banners', lazy: page(() => import('@/pages/banners'), (m) => m.BannersPage, 'banners') },
          { path: 'pages', lazy: page(() => import('@/pages/pages'), (m) => m.PagesPage, 'pages') },
          { path: 'announcements', lazy: page(() => import('@/pages/announcements'), (m) => m.AnnouncementsPage, 'announcements') },
          { path: 'delivery', lazy: page(() => import('@/pages/delivery'), (m) => m.DeliveryPage, 'delivery') },
          { path: 'settings', lazy: page(() => import('@/pages/settings'), (m) => m.SettingsPage, 'settings') },
          { path: 'admins', lazy: page(() => import('@/pages/admins'), (m) => m.AdminsPage) },
          { path: 'audit', lazy: page(() => import('@/pages/audit'), (m) => m.AuditPage, 'audit') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
