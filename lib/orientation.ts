import { normalizeDeg, shortestDelta } from "./geo";

const DEG = Math.PI / 180;

/**
 * Magnetic compass heading (degrees clockwise from magnetic north) of the
 * screen-top direction, tilt-compensated.
 *
 * Uses the W3C device orientation frame: R = Rz(alpha)·Rx(beta)·Ry(gamma)
 * maps device coordinates to the earth frame (x east, y north, z up).
 * `screenAngleDeg` is `screen.orientation.angle` (0/90/180/270).
 */
export function magneticHeading(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg: number,
): number {
  const a = alphaDeg * DEG;
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  const s = screenAngleDeg * DEG;

  // Screen-top vector in device coordinates (device +y rotated by −screenAngle about +z)
  let x = Math.sin(s);
  let y = Math.cos(s);
  let z = 0;

  // Ry(gamma)
  const x1 = Math.cos(g) * x + Math.sin(g) * z;
  const z1 = -Math.sin(g) * x + Math.cos(g) * z;
  x = x1;
  z = z1;

  // Rx(beta)
  const y2 = Math.cos(b) * y - Math.sin(b) * z;
  z = Math.sin(b) * y + Math.cos(b) * z;
  y = y2;

  // Rz(alpha) → earth frame east/north components
  const east = Math.cos(a) * x - Math.sin(a) * y;
  const north = Math.sin(a) * x + Math.cos(a) * y;

  return normalizeDeg(Math.atan2(east, north) / DEG);
}

/** Angle of the device's screen normal from vertical, in degrees. 0 = flat. */
export function tiltAngle(betaDeg: number, gammaDeg: number): number {
  const c = Math.cos(betaDeg * DEG) * Math.cos(gammaDeg * DEG);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/**
 * Exponential moving average on the unit-vector components of a heading.
 * Wrap-safe by construction. `confidence` is the resultant vector length:
 * ~1 for a steady heading, dropping towards 0 under noisy/contradictory input.
 */
export class CircularSmoother {
  private sx: number | null = null;
  private sy = 0;

  constructor(private readonly k: number) {}

  update(headingDeg: number): { heading: number; confidence: number } {
    const sin = Math.sin(headingDeg * DEG);
    const cos = Math.cos(headingDeg * DEG);
    if (this.sx === null) {
      this.sx = sin;
      this.sy = cos;
    } else {
      this.sx += this.k * (sin - this.sx);
      this.sy += this.k * (cos - this.sy);
    }
    return {
      heading: normalizeDeg(Math.atan2(this.sx, this.sy) / DEG),
      confidence: Math.hypot(this.sx, this.sy),
    };
  }
}

/**
 * Advance an unbounded cumulative rotation towards `targetDeg` (mod 360) by
 * the shortest arc, so a CSS rotate transition never spins the long way.
 */
export function nextCumulativeRotation(prevCumulativeDeg: number, targetDeg: number): number {
  return prevCumulativeDeg + shortestDelta(normalizeDeg(prevCumulativeDeg), normalizeDeg(targetDeg));
}
