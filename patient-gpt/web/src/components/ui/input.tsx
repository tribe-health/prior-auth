import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "min-h-10 w-full min-w-0 rounded-(--r) bg-(--field) text-(--field-fg) px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:bg-transparent file:text-sm file:font-semibold file:text-(--field-fg) placeholder:text-(--field-ph) disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-(--field-dim) disabled:opacity-50 md:text-sm ",
        className
      )}
      {...props}
    />
  )
}

export { Input }
