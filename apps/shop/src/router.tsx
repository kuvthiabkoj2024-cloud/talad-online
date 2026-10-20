import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { RequireAccount, RequireShop } from '@/components/require-shop'
import { COMING_SOON } from '@/nav'
import { ComingSoonPage } from '@/pages/coming-soon'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'

const page = <M,>(load: () => Promise<M>, pick: (m: M) => React.ComponentType) => () =>
  load().then((m) => ({ Component: pick(m) }))

// Heavier pages load on first visit, so sign-in stays light.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAccount />,
    children: [
      { path: 'register', lazy: page(() => import('@/pages/register'), (m) => m.RegisterPage) },
      {
        element: <RequireShop />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, lazy: page(() => import('@/pages/home'), (m) => m.HomeRoute) },
              { path: 'products', lazy: page(() => import('@/pages/products'), (m) => m.ProductsPage) },
              { path: 'products/new', lazy: page(() => import('@/pages/product-editor'), (m) => m.ProductEditorPage) },
              { path: 'products/:id', lazy: page(() => import('@/pages/product-editor'), (m) => m.ProductEditorPage) },
              { path: 'coupons', lazy: page(() => import('@/pages/coupons'), (m) => m.CouponsPage) },
              { path: 'orders', lazy: page(() => import('@/pages/orders'), (m) => m.OrdersPage) },
              { path: 'orders/:number', lazy: page(() => import('@/pages/order-detail'), (m) => m.OrderDetailPage) },
              { path: 'messages', lazy: page(() => import('@/pages/messages'), (m) => m.MessagesPage) },
              { path: 'messages/:id', lazy: page(() => import('@/pages/messages'), (m) => m.MessagesPage) },
              { path: 'chatbot', lazy: page(() => import('@/pages/chatbot'), (m) => m.ChatbotPage) },
              { path: 'videos', lazy: page(() => import('@/pages/videos'), (m) => m.VideosPage) },
              { path: 'marketing', lazy: page(() => import('@/pages/marketing'), (m) => m.MarketingPage) },
              { path: 'customers', lazy: page(() => import('@/pages/customers'), (m) => m.CustomersPage) },
              { path: 'finance', lazy: page(() => import('@/pages/finance'), (m) => m.FinancePage) },
              // Desktop shows these on the home page; phones open them from the home tool grid.
              { path: 'stats', lazy: page(() => import('@/pages/stats'), (m) => m.StatsPage) },
              { path: 'reviews', lazy: page(() => import('@/pages/reviews'), (m) => m.ReviewsPage) },
              { path: 'profile', lazy: page(() => import('@/pages/shop-profile'), (m) => m.ShopProfilePage) },
              { path: 'security', lazy: page(() => import('@/pages/security'), (m) => m.SecurityPage) },
              ...COMING_SOON.map((item) => ({ path: item.to.slice(1), element: <ComingSoonPage item={item} /> })),
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
