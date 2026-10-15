const points: { x: number; y: number; r: number; opacity: number }[] = [];
for (let x = -270; x <= 270; x += 12)
  for (let y = -130; y <= 130; y += 12) {
    const nx = x / 270,
      edge = 105 * Math.pow(Math.max(0, 1 - nx * nx), 0.75),
      dist = Math.hypot(x, y);
    const outline = Math.abs(Math.abs(y) - edge) < 10;
    const iris = dist < 77 && dist > 29;
    const pupil = dist < 17;
    const halo = dist > 80 && dist < 125 && (x + 2 * y) % 36 === 0;
    if (outline || iris || pupil || halo)
      points.push({
        x: x + 300,
        y: y + 150,
        r: pupil ? 2.1 : iris ? 2.2 : 1.7,
        opacity: outline
          ? 0.7
          : halo
            ? 0.2
            : 0.45 + (0.5 * (Math.cos((x - y) / 30) + 1)) / 2,
      });
  }
export function Eye({ pulse = false }: { pulse?: boolean }) {
  return (
    <svg
      className={`swarm-eye ${pulse ? 'pulse' : ''}`}
      viewBox="0 0 600 300"
      aria-hidden="true"
    >
      <g fill="currentColor">
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity={p.opacity} />
        ))}
      </g>
    </svg>
  );
}
