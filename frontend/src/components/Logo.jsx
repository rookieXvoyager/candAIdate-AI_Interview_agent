// candAIdate logo: graduation-cap + two-tone blue shield emblem, recreated as SVG
// so it stays crisp at any size. The "AI" in the wordmark is highlighted; no tagline.

const DARK = "#2c6ca0"; // shield / cap dark blue
const LIGHT = "#5fbdf0"; // shield / accent light blue
const COLLAR = "#dceffc"; // pale shirt collar
const TIE = "#143a5c"; // deep navy necktie

export function LogoMark({ className = "h-9 w-9" }) {
  return (
    <svg
      viewBox="0 0 64 72"
      className={className}
      role="img"
      aria-label="candAIdate logo"
    >
      {/* Graduation cap — mortarboard */}
      <path d="M32 5 L61 16 L32 27 L3 16 Z" fill={DARK} />
      <path d="M32 5 L61 16 L32 27 Z" fill={LIGHT} opacity="0.55" />
      {/* Button + tassel */}
      <circle cx="32" cy="16" r="2.4" fill={LIGHT} />
      <path
        d="M58 17 L58 28"
        stroke={LIGHT}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="58" cy="29.5" r="1.8" fill={LIGHT} />
      {/* Cap underside / head band */}
      <path d="M15 21 L15 29 Q32 39 49 29 L49 21 L32 28 Z" fill={DARK} />

      {/* Shield — light base (right lapel) */}
      <path
        d="M13 34 L51 34 L51 52 Q51 63.5 32 70 Q13 63.5 13 52 Z"
        fill={LIGHT}
      />
      {/* Dark left lapel */}
      <path d="M13 34 L32 34 L32 70 Q13 63.5 13 52 Z" fill={DARK} />
      {/* Shirt collar — pale V across the seam */}
      <path d="M23 34 L41 34 L32 49 Z" fill={COLLAR} />
      {/* Necktie — knot + blade down the centre */}
      <path d="M28.5 49 L35.5 49 L34 55 L30 55 Z" fill={TIE} />
      <path d="M30 55 L34 55 L33 65 L32 67.5 L31 65 Z" fill={TIE} />
    </svg>
  );
}

export default function Logo({
  markClassName = "h-8 w-8",
  textClassName = "text-lg",
  showMark = true,
}) {
  return (
    <span className="flex items-center gap-2">
      {showMark && <LogoMark className={markClassName} />}
      <span className={`font-bold tracking-tight text-white ${textClassName}`}>
        cand
        <span className="text-sky-400 [text-shadow:0_0_18px_rgba(95,189,240,0.45)]">
          AI
        </span>
        date
      </span>
    </span>
  );
}
