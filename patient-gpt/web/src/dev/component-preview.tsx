import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toast"
import { uiFixtures } from "./preview-ui"
import { assistantFixtures } from "./preview-assistant"
import "../styles/app.css"
import "./component-preview.css"

const fixtures = [...uiFixtures, ...assistantFixtures]
const modules = new Set(fixtures.flatMap(fixture => fixture.modules))

function ComponentPreview() {
  const [query, setQuery] = useState("")
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches)
  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark])
  const needle = query.trim().toLowerCase()
  const visible = fixtures.filter(fixture => `${fixture.title} ${fixture.modules.join(" ")} ${fixture.states}`.toLowerCase().includes(needle))
  return <TooltipProvider><Toaster><main className="preview-page">
    <header className="preview-header">
      <a href="/" aria-label="PatientGPT application"><img src={dark ? "/brand/wordmark-dark.svg" : "/brand/wordmark-light.svg"} alt="PatientGPT" width="190" height="48" /></a>
      <h1>Component preview</h1>
      <p>Shared web and desktop library. Synthetic fixtures only.</p>
      <div className="preview-toolbar"><Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a component or state" aria-label="Find a component or state" /><Button variant="secondary" onClick={() => setDark(value => !value)} aria-pressed={dark}>{dark ? "Use light theme" : "Use dark theme"}</Button></div>
      <p role="status" className="preview-note">{modules.size} modules composed across {fixtures.length} fixture groups. Showing {visible.length} groups. Coverage is an inventory, not a verification result.</p>
      <nav aria-label="Fixture groups" className="preview-index">{visible.map(fixture => <a key={fixture.id} href={`#${fixture.id}`}>{fixture.title}</a>)}</nav>
    </header>
    <div className="preview-grid">{visible.map(({ id, title, modules: names, states, Component }) => <section key={id} id={id} className="preview-section" aria-labelledby={`${id}-title`} data-preview-modules={names.join(" ")}><h2 id={`${id}-title`}>{title}</h2><p className="preview-modules">{names.join(" · ")}</p><p className="preview-note">{states}</p><div className="preview-fixture"><Component /></div></section>)}</div>
    {visible.length === 0 && <p>No fixture groups match this search.</p>}
    <footer className="preview-footer">Review at 320px, 768px, desktop, and 200% zoom. Check both themes, keyboard focus, overlays, reduced motion, and coarse-pointer targets.</footer>
  </main></Toaster></TooltipProvider>
}

const root = document.getElementById("root")
if (!root) throw new Error("component-preview.html has no #root element.")
createRoot(root).render(<StrictMode><ComponentPreview /></StrictMode>)
