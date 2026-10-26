"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-5 shrink-0 bg-(--field) text-(--field-fg) items-center justify-center rounded-(--r-tag) transition-colors outline-none focus-visible:bg-(--focus-bg) focus-visible:text-(--focus-fg) group-has-disabled/field:opacity-50 after:absolute after:-inset-3 disabled:cursor-not-allowed disabled:opacity-50  data-checked:bg-primary data-checked:text-primary-foreground ",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
