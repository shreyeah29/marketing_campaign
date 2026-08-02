/**
 * Social/ad platform glyphs — stroke-based SVG in the same visual family as
 * <Icon>, inheriting currentColor. Always monochrome at --text-secondary.
 * Unknown platforms fall back to a globe.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  FACEBOOK: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  INSTAGRAM: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </>
  ),
  LINKEDIN: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
  // X (formerly Twitter) — the brand mark, not a delete cross.
  X: <path d="M4 4l6.5 8.5L4 20h2.5l5-6.5L16.5 20H20l-6.8-8.8L19.5 4H17l-4.6 6L7.5 4H4z" />,
  YOUTUBE: (
    <>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </>
  ),
  TIKTOK: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  // Google Ads — magnifying glass (search / ads intent).
  GOOGLE: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  GOOGLE_ADS: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  // Google Analytics — chart bars, distinct from Ads.
  GOOGLE_ANALYTICS: (
    <>
      <line x1="6" y1="20" x2="6" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
    </>
  ),
  EMAIL: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </>
  ),
  WEBSITE: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
}

const GLOBE = (
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>
)

export function PlatformIcon({
  platform,
  size = 18,
}: {
  platform: string
  size?: number | undefined
}) {
  const key =
    platform === 'TWITTER'
      ? 'X'
      : platform === 'MAIL' || platform === 'EMAIL'
        ? 'EMAIL'
        : platform === 'WEB' || platform === 'WEBSITE' || platform === 'SITE'
          ? 'WEBSITE'
          : platform === 'GA' || platform === 'ANALYTICS'
            ? 'GOOGLE_ANALYTICS'
            : platform
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={platform}
      role="img"
      className="channel-glyph"
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    >
      {GLYPHS[key] ?? GLOBE}
    </svg>
  )
}

/** Alias matching the brief's ChannelGlyph name. */
export const ChannelGlyph = PlatformIcon
