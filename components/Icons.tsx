import React from 'react';

/* Single shared stroke-icon set. 24x24 grid, stroke follows currentColor.
   Only used where an icon carries meaning (nav, buttons, status markers);
   headings and labels stay plain text. */

const P: Record<string, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </>
  ),
  receipt: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h4a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M21.5 20v-1.5a4.5 4.5 0 0 0-3-4.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <line x1="5.5" y1="12" x2="5.51" y2="12" />
      <line x1="18.5" y1="12" x2="18.51" y2="12" />
    </>
  ),
  coin: (
    <>
      <line x1="12" y1="2.5" x2="12" y2="21.5" />
      <path d="M16.5 5.5H9.75a3.25 3.25 0 0 0 0 6.5h4.5a3.25 3.25 0 0 1 0 6.5H7" />
    </>
  ),
  package: (
    <>
      <path d="M21 16V8a1.8 1.8 0 0 0-.9-1.6l-7.2-4a1.8 1.8 0 0 0-1.8 0l-7.2 4A1.8 1.8 0 0 0 3 8v8a1.8 1.8 0 0 0 .9 1.6l7.2 4a1.8 1.8 0 0 0 1.8 0l7.2-4A1.8 1.8 0 0 0 21 16z" />
      <polyline points="3.3 7 12 12 20.7 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </>
  ),
  clipboard: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </>
  ),
  truck: (
    <>
      <rect x="1.5" y="5" width="13" height="11" rx="1" />
      <path d="M14.5 9h4l3 3.5V16h-7" />
      <circle cx="6" cy="18.5" r="2" />
      <circle cx="17.5" cy="18.5" r="2" />
    </>
  ),
  factory: (
    <>
      <path d="M3 21V9l6 4V9l6 4V4h6v17z" />
      <line x1="7" y1="16" x2="7.01" y2="16" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
      <line x1="17" y1="16" x2="17.01" y2="16" />
    </>
  ),
  zap: <polygon points="13 2 4 14 11 14 10 22 20 10 12 10 13 2" />,
  trending: (
    <>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </>
  ),
  shield: <path d="M12 22s8-3.6 8-10V5.5L12 2.5 4 5.5V12c0 6.4 8 10 8 10z" />,
  briefcase: (
    <>
      <rect x="2.5" y="7" width="19" height="13" rx="2" />
      <path d="M16 20V5.5A1.5 1.5 0 0 0 14.5 4h-5A1.5 1.5 0 0 0 8 5.5V20" />
    </>
  ),
  bank: (
    <>
      <line x1="3" y1="21.5" x2="21" y2="21.5" />
      <line x1="5.5" y1="18" x2="5.5" y2="10" />
      <line x1="9.8" y1="18" x2="9.8" y2="10" />
      <line x1="14.2" y1="18" x2="14.2" y2="10" />
      <line x1="18.5" y1="18" x2="18.5" y2="10" />
      <polygon points="12 2.5 21 8 3 8" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1.5" y1="14" x2="6.5" y2="14" />
      <line x1="9.5" y1="8" x2="14.5" y2="8" />
      <line x1="17.5" y1="16" x2="22.5" y2="16" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  menu: (
    <>
      <line x1="3.5" y1="7" x2="20.5" y2="7" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <line x1="3.5" y1="17" x2="20.5" y2="17" />
    </>
  ),
  x: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  check: <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  card: (
    <>
      <rect x="1.5" y="4.5" width="21" height="15" rx="2" />
      <line x1="1.5" y1="10" x2="22.5" y2="10" />
    </>
  ),
  book: (
    <>
      <path d="M2 3.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2z" />
      <path d="M22 3.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z" />
    </>
  ),
  camera: (
    <>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
    </>
  ),
  chart: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 8 12 3 17 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7.5" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <line x1="20" y1="4" x2="8.1" y2="15.9" />
      <line x1="14.5" y1="14.5" x2="20" y2="20" />
      <line x1="8.1" y1="8.1" x2="12" y2="12" />
    </>
  ),
  utensils: (
    <>
      <path d="M5 3v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V3" />
      <line x1="8" y1="3" x2="8" y2="21" />
      <path d="M18 3c-1.7 1-3 3-3 5.5s1.3 3.5 3 3.5V21" />
    </>
  ),
  landmark: (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 3 20 8 4 8" />
    </>
  ),
  sprout: (
    <>
      <path d="M7 20h10" />
      <path d="M12 20c0-6 2-8 6-10" />
      <path d="M12 20c0-4-2-6-6-7 0 4 2 7 6 7z" />
      <path d="M12 13c0-3 2-5 6-5.5C18 11 16 13 12 13z" />
    </>
  ),
  printer: (
    <>
      <polyline points="6 9 6 3 18 3 18 9" />
      <path d="M6 18H4.5A2.5 2.5 0 0 1 2 15.5v-4A2.5 2.5 0 0 1 4.5 9h15A2.5 2.5 0 0 1 22 11.5v4a2.5 2.5 0 0 1-2.5 2.5H18" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </>
  ),
  tag: (
    <>
      <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8L13.8 21a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </>
  ),
  arrowRight: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </>
  ),
  chevronRight: <polyline points="9 5 16 12 9 19" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6.5 12 12 15.5 14" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4.5" width="20" height="15" rx="2" />
      <polyline points="2.5 6.5 12 13 21.5 6.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  refresh: (
    <>
      <polyline points="21.5 3.5 21.5 9.5 15.5 9.5" />
      <path d="M21 9.5A9 9 0 0 0 5 6L3.5 7.5" />
      <polyline points="2.5 20.5 2.5 14.5 8.5 14.5" />
      <path d="M3 14.5A9 9 0 0 0 19 18l1.5-1.5" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z" />
      <polyline points="14 2.5 14 8.5 20 8.5" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 16,
  className = '',
  strokeWidth = 1.8,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const paths = P[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
