import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  /** Marks a field the form can't be sent without: a red asterisk after the text. */
  required?: boolean
}) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && <RequiredMark />}
    </LabelPrimitive.Root>
  )
}

/** The red asterisk, for headings that aren't a `<Label>` (e.g. a fieldset legend). */
function RequiredMark() {
  return (
    <span aria-hidden className="-ms-1.5 text-destructive">
      *
    </span>
  )
}

export { Label, RequiredMark }
