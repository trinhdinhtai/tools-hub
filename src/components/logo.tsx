import type { SVGProps } from "react";

/**
 * Tools Hub wordmark: hammer-shaped "T" + "ools" in the current text color, "hub" in a box: orange on pure black in the
 * light theme, black on orange in the dark theme.
 * Drawn from the brand file toolshub-logo-dark.svg, without its background so it works on both themes.
 * "hub" gets a same-color stroke so its smaller glyphs match the stroke weight of "ools", and the box sits
 * a little further right to leave a gap after "Tools".
 */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="262 280 912 210" role="img" aria-label="Tools Hub" {...props}>
      <path
        fill="currentColor"
        d="M 270 354 C 292 312, 326 296, 368 296 L 384 296 L 384 307 C 384 313, 396 313, 396 307 L 396 296 L 443 296 L 443 338 L 388 338 L 388 452 L 346 452 L 346 330 C 318 330, 292 338, 270 354 Z"
      />
      <text
        transform="translate(420 452) scale(0.86 1)"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontWeight={700}
        fontSize={216}
        fill="currentColor"
        letterSpacing={-4}
      >
        ools
      </text>
      <rect x={808} y={285} width={358} height={198} rx={22} className="fill-black dark:fill-brand" />
      <text
        transform="translate(987 446) scale(0.9 1)"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontWeight={700}
        fontSize={178}
        className="fill-brand stroke-brand dark:fill-[#111111] dark:stroke-[#111111]"
        strokeWidth={4}
        strokeLinejoin="round"
        letterSpacing={-2}
      >
        hub
      </text>
    </svg>
  );
}
