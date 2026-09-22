/**
 * DentoCare brand logo — green tooth with a leaf accent, optional wordmark.
 *
 * `variant` picks the ink color:
 *   - brand: green mark + green wordmark (on white/mist backgrounds)
 *   - dark:  green mark + dark wordmark
 *   - light: green mark + white wordmark (on dark-green sidebar)
 *
 * Both a named and a default export are provided.
 */

const PALETTE = {
  light: { main: '#FFFFFF', accent: '#A5D6A7' },
  dark: { main: '#165A3A', accent: '#A5D6A7' },
  brand: { main: '#2E7D52', accent: '#A5D6A7' },
};

export function DentoCareLogo({
  variant = 'brand',
  width = 220,
  height = 60,
  showText = true,
  className,
  ...props
}) {
  const { main, accent } = PALETTE[variant] || PALETTE.brand;

  if (!showText) {
    return (
      <svg
        width={width}
        height={height}
        viewBox="1 4 57 47"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        direction="ltr"
        className={className}
        aria-label="DentoCare Logo"
        role="img"
        {...props}
      >
        <g id="dentocare-mark">
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
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 250 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      direction="ltr"
      className={className}
      aria-label="DentoCare Logo"
      role="img"
      {...props}
    >
      <g id="dentocare-mark">
        <path
          d="M15,10 C15,10 5,20 10,40 C12,48 20,50 25,45 C30,40 30,30 35,45 C40,50 48,48 50,40 C55,20 45,10 45,10 C45,10 30,5 15,10 Z"
          fill={main}
        />
        <path
          d="M15,35 C25,35 35,25 45,15 C45,25 35,35 25,45 C20,45 15,40 15,35 Z"
          fill={accent}
        />
      </g>

      <text
        x="62"
        y="42"
        fontFamily="sans-serif"
        fontWeight="800"
        fontSize="26"
        textLength="185"
        lengthAdjust="spacingAndGlyphs"
        fill={main}
      >
        DentoCare
      </text>
    </svg>
  );
}

export default DentoCareLogo;