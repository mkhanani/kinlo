interface Props {
  size?: number;
  className?: string;
}

/** Two overlapping circles: two people, one link. */
export function LogoMark({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className={className}>
      <circle cx="24" cy="32" r="14" stroke="currentColor" strokeWidth="4" />
      <circle cx="40" cy="32" r="14" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark />
      <span className="text-md font-semibold tracking-[-0.03em] leading-none">kinlo</span>
    </span>
  );
}
