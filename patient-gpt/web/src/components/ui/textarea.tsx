import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-(--r) bg-(--field) text-(--field-fg) px-2.5 py-2 text-base transition-colors outline-none placeholder:text-(--field-ph) disabled:cursor-not-allowed disabled:bg-(--field-dim) disabled:opacity-50 md:text-sm ",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
