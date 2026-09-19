import { useId } from "react";

// Variants describe the SURFACE the logo sits on, not the app theme:
//   onDark  -> white text  (for dark backgrounds, e.g. dark sidebar)
//   onLight -> deep green  (for light backgrounds)
//   brand   -> brand green (default, on any light-ish background)
const PALETTE = {
  onDark: { main: "#FFFFFF", accent: "#A5D6A7" },
  onLight: { main: "#165A3A", accent: "#A5D6A7" },
  brand: { main: "#2E7D52", accent: "#A5D6A7" },
};

// Old confusing names (light = white, dark = green) kept as aliases
const VARIANT_ALIASES = {
  light: "onDark",
  dark: "onLight",
};

const MARK_VIEWBOX = "4 4 52 46";

export function DentoCareLogo({
  variant = "brand",
  width = 32,
  height = 30,
  showText = true,
  className,
  ...props
}) {
  const resolved = VARIANT_ALIASES[variant] || variant;
  const { main, accent } = PALETTE[resolved] || PALETTE.brand;

  // Unique per instance so multiple logos don't share a conflicting SVG id
  const markId = `dentocare-mark-${useId()}`;

  const mark = (
    <svg
      width={width}
      height={height}
      viewBox={MARK_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      role="img"
      aria-label="DentoCare Logo"
    >
      <g id={markId}>
        <path
          d="M15,10 C15,10 5,20 10,40 C12,48 20,50 25,45 C30,40 30,30 35,45 C40,50 48,48 50,40 C55,20 45,10 45,10 C45,10 30,5 15,10 Z"
          fill={main}
        />
        <path
          d="M15,35 C25,35 35,25 45,15 C45,25 35,35 25,45 C20,45 15,40 15,35 Z"
          fill={accent}
        />
      </g>
    </svg>
  );

  if (!showText) return mark;

  return (
    <span
      className={`inline-flex items-center gap-2 ${className || ""}`}
      {...props}
    >
      {mark}
      <span
        className="whitespace-nowrap text-lg font-extrabold leading-none"
        style={{ color: main }}
      >
        DentoCare
      </span>
    </span>
  );
}

export default DentoCareLogo;