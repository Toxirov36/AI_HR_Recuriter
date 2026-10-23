/** Three ranked bars, the top one lit: the shortlist itself. Self-contained, so it needs no stylesheet. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="10" fill="#155c43" />
      <rect x="7" y="8.5" width="18" height="4.5" rx="2.25" fill="#c9f36b" />
      <rect x="7" y="14.5" width="13" height="4.5" rx="2.25" fill="#eaf3ee" opacity="0.8" />
      <rect x="7" y="20.5" width="8" height="4.5" rx="2.25" fill="#eaf3ee" opacity="0.45" />
    </svg>
  );
}
