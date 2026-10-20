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

export function FileIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      className={className}
      {...base}
    >
      <path d="M6.5 3.5h7L18.5 8.5v12h-12z" />
      <path d="M13.5 3.5v5h5" />
      <path d="M9.5 13.5h6M9.5 17h4" />
    </svg>
  );
}

export function GearIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      className={className}
      {...base}
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.7v2.4M12 18.9v2.4M2.7 12h2.4M18.9 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
    </svg>
  );
}

export function MenuIcon({ size = 19, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      className={className}
      {...base}
    >
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
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

export function ChevronLeftIcon({ size = 15, className }: IconProps) {  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2"
      className={className}
      {...base}
    >
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </svg>
  );
}

export function StarIcon({
  size = 13,
  className,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      className={className}
      {...base}
      fill={filled ? 'currentColor' : 'none'}
    >
      <path d="M12 3.9l2.5 5.1 5.6.8-4 3.9.95 5.6L12 16.6l-5.05 2.7.95-5.6-4-3.9 5.6-.8z" />
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
