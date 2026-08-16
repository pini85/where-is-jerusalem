import { describe, expect, test } from "vitest";
import {
  JERUSALEM,
  applyDeclination,
  distanceKm,
  initialBearing,
  normalizeDeg,
  shortestDelta,
} from "./geo";

// Fixtures hand-verified against the great-circle initial bearing formula
// θ = atan2(sinΔλ·cosφ₂, cosφ₁·sinφ₂ − sinφ₁·cosφ₂·cosΔλ)
describe("initialBearing to Jerusalem", () => {
  test("from New York is ~54°", () => {
    expect(initialBearing(40.7128, -74.006, JERUSALEM.lat, JERUSALEM.lon)).toBeCloseTo(54.1, 0);
  });

  test("from London is ~114°", () => {
    expect(initialBearing(51.5074, -0.1278, JERUSALEM.lat, JERUSALEM.lon)).toBeCloseTo(113.6, 0);
  });

  test("from Tel Aviv is ~129° (east-southeast)", () => {
    expect(initialBearing(32.0853, 34.7818, JERUSALEM.lat, JERUSALEM.lon)).toBeCloseTo(128.6, 0);
  });

  test("from due north of Jerusalem is 180°", () => {
    expect(initialBearing(40, JERUSALEM.lon, JERUSALEM.lat, JERUSALEM.lon)).toBeCloseTo(180, 5);
  });

  test("is always in [0, 360)", () => {
    const b = initialBearing(31, 40, JERUSALEM.lat, JERUSALEM.lon); // south-east of JLM → north-westish
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(b).toBeGreaterThan(180); // must be a westerly bearing, not negative
  });
});

describe("normalizeDeg", () => {
  test("wraps negatives", () => {
    expect(normalizeDeg(-10)).toBe(350);
  });
  test("wraps over 360", () => {
    expect(normalizeDeg(370)).toBe(10);
  });
  test("keeps in-range values", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(359.5)).toBe(359.5);
  });
});

describe("shortestDelta", () => {
  test("350° → 10° is +20", () => {
    expect(shortestDelta(350, 10)).toBe(20);
  });
  test("10° → 350° is −20", () => {
    expect(shortestDelta(10, 350)).toBe(-20);
  });
  test("never exceeds ±180", () => {
    expect(Math.abs(shortestDelta(0, 180))).toBe(180);
    expect(shortestDelta(0, 181)).toBe(-179);
  });
});

describe("distanceKm", () => {
  test("Tel Aviv → Jerusalem is ~54 km", () => {
    const d = distanceKm(32.0853, 34.7818, JERUSALEM.lat, JERUSALEM.lon);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(60);
  });
});

describe("applyDeclination (magnetic → true north, east-positive)", () => {
  test("east declination adds", () => {
    expect(applyDeclination(0, 5)).toBe(5);
  });
  test("west declination wraps below zero", () => {
    expect(applyDeclination(0, -12)).toBe(348);
  });
});
