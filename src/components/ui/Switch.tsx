/** An on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border border-hairline transition-colors duration-200 disabled:opacity-50 ${
        checked ? "bg-fg" : "bg-control"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color] duration-200 ease-out ${
          checked ? "left-[18px] bg-bg" : "left-0.5 bg-muted"
        }`}
      />
    </button>
  );
}
