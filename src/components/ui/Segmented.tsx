interface Option<T extends string> {
  value: T;
  label: string;
}

/** A small set of mutually exclusive choices, shown side by side. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="control inline-flex w-fit max-w-full p-0.5 hover:!bg-control">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`h-7 rounded-[8px] px-2.5 text-sm transition-colors duration-200 ${
            value === option.value ? "bg-active text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
