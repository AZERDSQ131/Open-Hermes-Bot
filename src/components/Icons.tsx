type IconProps = {
  size?: number;
  className?: string;
};

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2"
      className={className}
      {...base}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20.4 20.4-4.1-4.1" />
    </svg>
  );
}

export function PlusIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

export function MonitorIcon({ size = 19, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      className={className}
      {...base}
    >
      <rect x="2.8" y="3.8" width="18.4" height="13.6" rx="3" />
      <path d="M9.4 21h5.2" />
      <circle cx="17.4" cy="7.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MicIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.9"
      className={className}
      {...base}
    >
      <rect x="9" y="2.8" width="6" height="11" rx="3" />
      <path d="M18.6 10.6a6.6 6.6 0 0 1-13.2 0" />
      <path d="M12 17.2v3.4" />
    </svg>
  );
}

export function PinIcon({ size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <path d="M9 3.5h6" />
      <path d="M10 3.5v5.2l-2.6 2.8v1.8h9.2v-1.8L14 8.7V3.5" />
      <path d="M12 13.3v7.2" />
    </svg>
  );
}

export function EnvelopeIcon({ size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <rect x="3" y="5.2" width="18" height="13.6" rx="2.6" />
      <path d="m4.8 7.4 7.2 5.2 7.2-5.2" />
    </svg>
  );
}

export function PencilIcon({ size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <path d="M4.5 19.5h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 4Z" />
      <path d="m14.8 7.2 3 3" />
    </svg>
  );
}

export function TrashIcon({ size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <path d="M4.5 7h15" />
      <path d="M9.2 7V4.6h5.6V7" />
      <path d="M6.9 7l.8 12.4h8.6L17.1 7" />
      <path d="M10.3 10.8v5.3M13.7 10.8v5.3" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2.1"
      className={className}
      {...base}
    >
      <path d="M12 19V5" />
      <path d="m5.8 11.2 6.2-6.2 6.2 6.2" />
    </svg>
  );
}
