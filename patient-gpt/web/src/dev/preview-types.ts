import type { ComponentType } from "react"

export type PreviewFixture = {
  id: string
  title: string
  modules: readonly string[]
  states: string
  Component: ComponentType
}
