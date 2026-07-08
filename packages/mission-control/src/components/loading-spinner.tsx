interface LoadingSpinnerProps {
  /** Optional label displayed below the spinner */
  label?: string;
  /** Size of the spinner circle in pixels (default: 24) */
  size?: number;
}

export function LoadingSpinner({ label, size = 24 }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <svg
        className="animate-spin text-primary"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Loading"
        role="status"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label && (
        <span className="text-xs text-muted-foreground font-mono">{label}</span>
      )}
    </div>
  );
}
