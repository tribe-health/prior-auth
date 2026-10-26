import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--r) bg-clip-padding text-sm font-bold whitespace-nowrap transition-colors duration-(--dur-enter) ease-(--ease) outline-none focus-visible:bg-(--focus-bg) focus-visible:text-(--focus-fg) select-none disabled:pointer-events-none disabled:bg-(--s3) disabled:text-(--fg-2) disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-(--primary-hover)",
        outline:
          "bg-secondary text-secondary-foreground hover:bg-(--s4) aria-expanded:bg-(--s4)",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-(--s4) aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-(--gap-surface) text-destructive hover:bg-destructive hover:text-primary-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "min-h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-(--r) px-2 text-xs in-data-[slot=button-group]:rounded-(--r) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-(--r) px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-(--r) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-(--r) in-data-[slot=button-group]:rounded-(--r) [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-(--r) in-data-[slot=button-group]:rounded-(--r)",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
