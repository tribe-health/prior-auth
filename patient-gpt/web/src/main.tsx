// TJ-ARCH-MOB-001 compliant
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { boot } from './app/boot'
import { router } from './app/router'
import './styles/app.css'

boot()

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element.')
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
