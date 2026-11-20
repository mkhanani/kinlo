import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  secondary: "control text-fg",
  ghost: "text-muted hover:bg-control hover:text-fg",
  danger: "bg-danger/90 text-white hover:bg-danger",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", className = "", ...rest },
  ref,
) {
  const sizing = size === "sm" ? "h-7 px-2.5 text-sm" : "h-8 px-3 text-base";
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-[background-color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-50 ${sizing} ${styles[variant]} ${className}`}
      {...rest}
    />
  );
});
