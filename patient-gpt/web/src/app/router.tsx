// TJ-ARCH-MOB-001 compliant
// Routes mirror the prototype's (shell.js): `/`, `/p/<patient>`, `/c/<case>`,
// `/chat/<id>`, on hash history so the same build runs from a file or a
// Tauri asset URL without server rewrites.
import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from './shell/app-shell'
import { CasePage, ChatPage, HomePage, PatientPage } from './shell/route-pages'

const rootRoute = createRootRoute({ component: AppShell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const patientRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$patientId', component: PatientPage })
const caseRoute = createRoute({ getParentRoute: () => rootRoute, path: '/c/$caseId', component: CasePage })
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat/$conversationId',
  component: ChatPage,
})

const routeTree = rootRoute.addChildren([homeRoute, patientRoute, caseRoute, chatRoute])

export const router = createRouter({ routeTree, history: createHashHistory(), defaultNotFoundComponent: HomePage })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
