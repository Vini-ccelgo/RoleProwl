import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Props = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
};
export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <Link className={cn("button", `button-${variant}`, className)} {...props} />
  );
}
