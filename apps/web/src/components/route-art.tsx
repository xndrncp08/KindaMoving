/** Illustrated route (not a GPS trace). Decorative: callers caption it. */
export function RouteArt() {
  return (
    <svg
      className="route-art"
      viewBox="0 0 500 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="route-art-grid"
          width="42"
          height="42"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 42 0 L 0 0 0 42"
            fill="none"
            stroke="#a2b993"
            strokeWidth=".5"
            opacity=".3"
          />
        </pattern>
      </defs>
      <rect width="500" height="600" fill="url(#route-art-grid)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M-50 ${150 + i * 25} Q170 ${-80 + i * 40} 290 ${180 + i * 25} T560 ${260 + i * 35}`}
          stroke="#78996a"
          strokeWidth="1"
          fill="none"
          opacity=".4"
        />
      ))}
      <path
        d="M125 375L100 285Q100 240 160 238L250 232L281 135Q292 110 325 140L379 236L333 320L254 328L219 429L125 375Z"
        fill="none"
        stroke="#d4ff3a"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle
        cx="125"
        cy="375"
        r="9"
        fill="#d4ff3a"
        stroke="#161816"
        strokeWidth="4"
      />
    </svg>
  );
}
