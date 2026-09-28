import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-[8px] border border-input bg-surface px-3 text-[13px] text-foreground shadow-ui-sm transition-[border-color,box-shadow] placeholder:text-subtle focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, "h-9", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, "min-h-[84px] resize-y py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Textarea + live character count that turns red past the limit. */
export function ReasonField({
  value,
  onChange,
  max,
  label,
  placeholder,
  autoFocus,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  max: number;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const over = value.length > max;
  return (
    <div>
      <Textarea
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={over || undefined}
        aria-required={required || undefined}
        placeholder={placeholder}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={cn("mt-1 text-right text-[11px] tabular", over ? "text-danger" : "text-subtle")}>
        {value.length}/{max}
      </div>
    </div>
  );
}
