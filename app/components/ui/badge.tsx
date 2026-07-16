import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center justify-center rounded-base border-2 border-border font-heading leading-none",
  {
    variants: {
      variant: {
        default: "bg-main text-main-foreground shadow-shadow",
        noShadow: "bg-main text-main-foreground",
        neutral: "bg-secondary-background text-foreground shadow-shadow",
      },
      size: {
        default: "px-3 py-1 text-sm",
        rank: "min-w-[4.75rem] px-3 py-2 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
