import { createRootRoute, Navigate } from '@tanstack/react-router'
import { AppShell } from '../AppShell'

export const Route = createRootRoute({
  component: AppShell,
  // An unknown path lands on the dashboard — the app's default view, and a safe landing for
  // typos and stale links.
  notFoundComponent: () => <Navigate to="/" replace />,
})
