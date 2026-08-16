declare module "magvar" {
  /**
   * Magnetic declination in degrees at a WGS84 position (WMM2025).
   * East-positive: magnetic north is east of true north when positive.
   * @param altitudeKm kilometres above mean sea level (default 0)
   * @param when decimal year or Date (default: current UTC time)
   */
  export function magvar(
    latitude: number,
    longitude: number,
    altitudeKm?: number,
    when?: number | Date,
  ): number;
}
