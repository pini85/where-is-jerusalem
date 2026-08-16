// Temple Mount, Jerusalem
export const JERUSALEM = { lat: 31.778, lon: 35.2354 } as const;

const DEG = Math.PI / 180;

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest rotation from `fromDeg` to `toDeg`, in (−180, 180]. */
export function shortestDelta(fromDeg: number, toDeg: number): number {
  const d = normalizeDeg(toDeg - fromDeg);
  return d > 180 ? d - 360 : d;
}

/** Great-circle initial bearing from point 1 to point 2, degrees clockwise from true north, [0, 360). */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const dLambda = (lon2 - lon1) * DEG;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normalizeDeg(Math.atan2(y, x) / DEG);
}

/** Haversine distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dPhi = (lat2 - lat1) * DEG;
  const dLambda = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Convert a magnetic heading to true heading. Declination is east-positive (WMM convention). */
export function applyDeclination(magneticDeg: number, declinationDeg: number): number {
  return normalizeDeg(magneticDeg + declinationDeg);
}
