import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "w-full rounded-[10px] border border-hairline bg-control px-2.5 text-base text-fg outline-none transition-colors duration-200 placeholder:text-subtle hover:bg-control-hover focus:border-[var(--ring)] focus:bg-control disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} className={`${base} h-8 ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={`${base} resize-none py-1.5 leading-5 ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={`${base} h-8 appearance-none pr-7 ${className}`} {...rest}>
      {children}
    </select>
  );
});

/** A label above a control. Pass a render function to receive the id that ties them together. */
export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
