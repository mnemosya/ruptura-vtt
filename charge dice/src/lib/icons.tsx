import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Flame = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1-.5-1.7-.5-1.7C16 11 17 13.5 17 15a5 5 0 0 1-10 0c0-3.5 3-5 5-12Z" />
  </svg>
);

export const Bolt = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 3 5 13h5l-1 8 8-11h-5l1-7Z" />
  </svg>
);

export const Drop = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11Z" />
  </svg>
);

export const Blade = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20 15 9M14 4l6 6-3 1-1 3-6-6 1-3 3-1ZM4 20l2-2M4 20l4 0" />
  </svg>
);

export const Syringe = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 3l6 6M18 6l-9 9-4 1 1-4 9-9M9 15l-4 4M10 8l3 3" />
  </svg>
);

export const Sigil = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const Target = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const Clock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Chevron = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Check = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12l5 5L20 6" />
  </svg>
);

export const DoubleCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 13l4 4 8-9M11 17l1 1 9-10" />
  </svg>
);

export const Cross = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Half = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" opacity="0.5" />
  </svg>
);

export const Warn = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17h.01" />
  </svg>
);

export const Eye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const Trash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
);

export const Shield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" />
  </svg>
);

export const Book = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4ZM5 18h13" />
  </svg>
);

export const Dice = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const Ruler = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4" />
  </svg>
);

export const Cursor = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3l6 16 2.5-6.5L20 10 5 3Z" />
  </svg>
);

export const MapPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const Hexagon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l7 4v10l-7 4-7-4V7l7-4Z" />
  </svg>
);

export const Swords = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4l8 8M4 4l0 4M4 4l4 0M20 4l-8 8M20 4l0 4M20 4l-4 0M9 15l-5 5M15 15l5 5M8 19l-2-2M16 19l2-2" />
  </svg>
);

export const Brush = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 4l5 5-8 8H7v-5l8-8ZM4 20c1-3 3-3 3-3M13 6l5 5" />
  </svg>
);

export const Cube = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM12 3v18M4 7.5l8 4.5 8-4.5" />
  </svg>
);

export const UserPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M18 8v6M15 11h6" />
  </svg>
);

export const Layers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />
  </svg>
);

export const Gear = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </svg>
);

export const Minus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const X = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Plus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Undo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" />
  </svg>
);

export const Note = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" />
  </svg>
);
