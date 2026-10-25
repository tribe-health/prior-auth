# Tauri + React Auth Reference
> Zustand 5 · TanStack Router · Ory Kratos · Supabase · @tauri-apps/plugin-store

## App initialization (main.tsx)

```typescript
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/providers'
import { useAuthStore } from './features/auth/stores/authStore'
import './index.css'

// Initialize auth state from persisted store, then connect Supabase listener
async function bootstrap() {
  // Restore persisted session from Tauri Store plugin
  await useAuthStore.getState().initialize()

  createRoot(document.getElementById('root')!).render(
    <StrictMode><AppProviders /></StrictMode>
  )
}

bootstrap()
```

## TanStack Router with auth context

```typescript
// src/app/router.tsx
import {
  createRouter, createRootRoute, createRoute,
  redirect, Outlet,
} from '@tanstack/react-router'
import type { AuthState } from '@/features/auth/stores/authStore'
import { useAuthStore } from '@/features/auth/stores/authStore'
import { AppShell } from '@/shared/components/AppShell'
import { LoginScreen } from '@/features/auth/components/LoginScreen'
import { ChatScreen } from '@/features/chat/components/ChatScreen'

const rootRoute = createRootRoute({
  component: Outlet,
})

// Public routes (no auth required)
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginScreen,
  beforeLoad: () => {
    // Redirect authenticated users away from login
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
})

// Protected shell — all authenticated routes live here
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: () => <AppShell><Outlet /></AppShell>,
  beforeLoad: ({ location }) => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: () => <div>Home</div>,
})

const chatRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/chat',
  component: ChatScreen,
})

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/settings',
  component: () => <div>Settings</div>,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    loginRoute,
    protectedRoute.addChildren([indexRoute, chatRoute, settingsRoute]),
  ]),
})

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
```

## Supabase auth store reference

```typescript
// src/features/auth/stores/authStore.ts
import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { createClient, type Session, type User } from '@supabase/supabase-js'
import { getVersion } from '@tauri-apps/api/app'

// Client is module-level — shared across the store and registered entity transports
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,    // Let Supabase handle session refresh
      autoRefreshToken: true,
      detectSessionInUrl: false, // Not a web browser
    },
  }
)

interface AuthState {
  user:            User | null
  session:         Session | null
  isAuthenticated: boolean
  isLoading:       boolean
  error:           string | null
}

interface AuthActions {
  initialize:  () => Promise<void>
  signIn:      (email: string, password: string) => Promise<void>
  signUp:      (email: string, password: string, metadata?: Record<string, unknown>) => Promise<void>
  signOut:     () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError:  () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        user: null, session: null,
        isAuthenticated: false, isLoading: false, error: null,

        // Called at app startup — restores session and wires listener
        initialize: async () => {
          set({ isLoading: true })
          // Get existing session (Supabase persists to localStorage)
          const { data: { session } } = await supabase.auth.getSession()
          set({
            session,
            user: session?.user ?? null,
            isAuthenticated: !!session,
            isLoading: false,
          })

          // Wire Supabase auth state changes to the Zustand store
          supabase.auth.onAuthStateChange((_event, session) => {
            set({
              session,
              user:            session?.user ?? null,
              isAuthenticated: !!session,
            })
            // Redirect on sign-out — store drives navigation via router
            if (!session) {
              router.navigate({ to: '/login' }).catch(() => {})
            }
          })
        },

        signIn: async (email, password) => {
          set({ isLoading: true, error: null })
          try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) throw error
            set({
              session:         data.session,
              user:            data.user,
              isAuthenticated: true,
              isLoading:       false,
            })
          } catch (e) {
            set({ error: (e as Error).message, isLoading: false })
            throw e
          }
        },

        signUp: async (email, password, metadata) => {
          set({ isLoading: true, error: null })
          try {
            const { data, error } = await supabase.auth.signUp({
              email, password,
              options: { data: metadata },
            })
            if (error) throw error
            set({
              user:      data.user,
              session:   data.session,
              isAuthenticated: !!data.session,
              isLoading: false,
            })
          } catch (e) {
            set({ error: (e as Error).message, isLoading: false })
            throw e
          }
        },

        signOut: async () => {
          await supabase.auth.signOut()
          set({ user: null, session: null, isAuthenticated: false })
        },

        resetPassword: async (email) => {
          const { error } = await supabase.auth.resetPasswordForEmail(email)
          if (error) throw error
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: 'auth-state',
        // Only persist minimal state — Supabase manages the actual session
        partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
      }
    )
  )
)
```

## Supabase Prometheus Entity Management hooks

```typescript
// src/features/auth/entities/profileEntities.ts
import {
  makeRestTransport,
  registerEntityTransport,
  useEntities,
  useEntityMutation,
} from '@prometheus-ags/prometheus-entity-management'
import { supabase } from '../stores/authStore'
import { useAuthStore } from '../stores/authStore'

export interface UserProfile {
  id:           string
  email:        string
  display_name: string | null
  avatar_url:   string | null
  role:         'user' | 'admin'
  created_at:   string
}

registerEntityTransport('UserProfile', makeRestTransport({ supabase, table: 'profiles' }))

// Get current user's profile from the normalized entity graph.
export function useMyProfile() {
  const userId = useAuthStore((s) => s.user?.id)
  const profiles = useEntities<UserProfile>('UserProfile', { enabled: !!userId })
  return { ...profiles, data: profiles.items.find((profile) => profile.id === userId) ?? null }
}

export function useUpdateProfile() {
  const userId = useAuthStore.getState().user?.id
  return useEntityMutation<Partial<UserProfile>, UserProfile, UserProfile>({
    type: 'UserProfile',
    mutate: (updates) =>
      supabase.from('profiles').update(updates).eq('id', userId!).select().single()
        .then(({ data, error }) => { if (error) throw error; return data as UserProfile }),
    normalize: (profile) => ({ id: profile.id, data: profile }),
  })
}
```

The frontend role union is a presentation projection only. The backend derives
the effective role and tenant from `VerifiedSession` after JWKS or authoritative
session validation. Never decode a JWT and treat its claims as verified, never
include a service role in client-visible types, and never accept a tenant ID
from a frontend request.

## Ory Kratos auth store

```typescript
// src/features/auth/stores/kratosAuthStore.ts
// For enterprise / self-hosted identity with Kratos
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

const KRATOS_URL = import.meta.env.VITE_KRATOS_PUBLIC_URL

interface KratosSession {
  id:    string
  token: string
  identity: { id: string; traits: { email: string } }
}

interface KratosAuthState {
  session:         KratosSession | null
  isAuthenticated: boolean
  isLoading:       boolean
  error:           string | null
}

interface KratosAuthActions {
  signIn:     (identifier: string, password: string) => Promise<void>
  signUp:     (email: string, password: string) => Promise<void>
  signOut:    () => Promise<void>
  whoami:     () => Promise<void>
  clearError: () => void
}

export const useKratosStore = create<KratosAuthState & KratosAuthActions>()(
  subscribeWithSelector((set, get) => ({
    session: null, isAuthenticated: false, isLoading: false, error: null,

    signIn: async (identifier, password) => {
      set({ isLoading: true, error: null })
      try {
        // 1. Init login flow
        const flowRes = await fetch(`${KRATOS_URL}/self-service/login/api`, {
          headers: { Accept: 'application/json' },
        })
        const { id: flowId } = await flowRes.json()

        // 2. Submit password
        const res = await fetch(`${KRATOS_URL}/self-service/login?flow=${flowId}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ method: 'password', identifier, password }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err?.ui?.messages?.[0]?.text ?? err?.error?.message ?? 'Login failed')
        }
        const data = await res.json()
        const session: KratosSession = {
          id:       data.session.id,
          token:    data.session_token,
          identity: data.session.identity,
        }

        // Store token via Tauri secure store in production
        // await Store.set('kratos_token', session.token)
        set({ session, isAuthenticated: true, isLoading: false })
      } catch (e) {
        set({ error: (e as Error).message, isLoading: false })
        throw e
      }
    },

    signUp: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const flowRes = await fetch(`${KRATOS_URL}/self-service/registration/api`, {
          headers: { Accept: 'application/json' },
        })
        const { id: flowId } = await flowRes.json()
        const res = await fetch(`${KRATOS_URL}/self-service/registration?flow=${flowId}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ method: 'password', password, traits: { email } }),
        })
        if (!res.ok) throw new Error('Registration failed')
        set({ isLoading: false })
      } catch (e) {
        set({ error: (e as Error).message, isLoading: false })
        throw e
      }
    },

    signOut: async () => {
      const { session } = get()
      if (session?.token) {
        await fetch(`${KRATOS_URL}/self-service/logout/api`, {
          method:  'DELETE',
          headers: { 'X-Session-Token': session.token },
        }).catch(() => {})
      }
      set({ session: null, isAuthenticated: false })
    },

    whoami: async () => {
      const { session } = get()
      if (!session?.token) return
      const res = await fetch(`${KRATOS_URL}/sessions/whoami`, {
        headers: { 'X-Session-Token': session.token, Accept: 'application/json' },
      })
      if (!res.ok) {
        set({ session: null, isAuthenticated: false })
        return
      }
      const data = await res.json()
      set({ session: { ...session, identity: data.identity }, isAuthenticated: true })
    },

    clearError: () => set({ error: null }),
  }))
)
```

## Auth hook (components use this — never the store directly)

```typescript
// src/features/auth/hooks/useAuth.ts
import { useAuthStore } from '../stores/authStore'     // Supabase
// OR import { useKratosStore } from '../stores/kratosAuthStore'

export function useAuth() {
  // Granular selectors — prevent unnecessary re-renders
  const user            = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading       = useAuthStore((s) => s.isLoading)
  const error           = useAuthStore((s) => s.error)
  const signIn          = useAuthStore((s) => s.signIn)
  const signUp          = useAuthStore((s) => s.signUp)
  const signOut         = useAuthStore((s) => s.signOut)
  const clearError      = useAuthStore((s) => s.clearError)
  return { user, isAuthenticated, isLoading, error, signIn, signUp, signOut, clearError }
}
```

## Login component (imports only hook)

```typescript
// src/features/auth/components/LoginScreen.tsx
// Component imports ONLY the hook — never the store
import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from '../hooks/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'

export function LoginScreen() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const { signIn, isLoading, error, clearError } = useAuth() // ← hook only
  const navigate = useNavigate()
  const search   = useSearch({ from: '/login' }) as { redirect?: string }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await signIn(email, password)
      navigate({ to: search.redirect ?? '/', replace: true })
    } catch { /* error displayed from store */ }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {error && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 p-3">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Combining Kratos identity + Supabase database

When Kratos handles identity and Supabase handles data:

```typescript
// src/features/auth/api/tokenExchangeApi.ts
// Call your backend (gen_ui_core Tauri command) to exchange the Kratos token
import { invoke } from '@tauri-apps/api/core'

export async function exchangeKratosForSupabase(kratosToken: string): Promise<string> {
  // Rust backend verifies Kratos session via admin API,
  // then mints a Supabase JWT with the user's claims
  return invoke<string>('exchange_kratos_for_supabase', { kratosToken })
}
```

```rust
// src-tauri/src/commands/auth.rs
#[tauri::command]
async fn exchange_kratos_for_supabase(kratos_token: String) -> Result<String, String> {
    // 1. Verify Kratos session via admin API (KRATOS_ADMIN_URL — server-side only)
    // 2. Extract identity ID + traits
    // 3. Sign a Supabase JWT using SUPABASE_JWT_SECRET
    // Never expose KRATOS_ADMIN_URL or SUPABASE_JWT_SECRET to the frontend
    gen_ui_core::auth::exchange_kratos_for_supabase(&kratos_token).await
        .map_err(|e| e.to_string())
}
```
