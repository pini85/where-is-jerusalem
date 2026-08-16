import { describe, expect, test } from "vitest";
import {
  CircularSmoother,
  magneticHeading,
  nextCumulativeRotation,
  tiltAngle,
} from "./orientation";

describe("magneticHeading", () => {
  // Spec frame: at alpha=beta=gamma=0 the device lies flat, top pointing north.
  test("flat portrait: heading = 360 − alpha", () => {
    expect(magneticHeading(0, 0, 0, 0)).toBeCloseTo(0, 5);
    expect(magneticHeading(90, 0, 0, 0)).toBeCloseTo(270, 5);
    expect(magneticHeading(250, 0, 0, 0)).toBeCloseTo(110, 5);
  });

  test("flat landscape (screen angle 90): device +x is screen-top", () => {
    // Unrotated device: +x points east → heading 90
    expect(magneticHeading(0, 0, 0, 90)).toBeCloseTo(90, 5);
    // Device yawed 90° CCW: +x points north → heading 0
    expect(magneticHeading(90, 0, 0, 90)).toBeCloseTo(0, 5);
  });

  test("moderate pitch does not change heading when pointing north", () => {
    // Tilt the phone up towards the user (beta 30°) while facing north
    expect(magneticHeading(0, 30, 0, 0)).toBeCloseTo(0, 5);
  });

  test("moderate tilt perturbs heading only slightly", () => {
    const h = magneticHeading(45, 20, 10, 0);
    // 360 − 45 = 315 is the flat answer; compensated value stays in the neighbourhood
    expect(Math.abs(h - 315)).toBeLessThan(15);
  });

  test("result is in [0, 360)", () => {
    const h = magneticHeading(10, -5, 3, 0);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});

describe("tiltAngle", () => {
  test("flat is 0", () => {
    expect(tiltAngle(0, 0)).toBeCloseTo(0, 5);
  });
  test("pure pitch", () => {
    expect(tiltAngle(40, 0)).toBeCloseTo(40, 5);
  });
  test("pure roll", () => {
    expect(tiltAngle(0, 30)).toBeCloseTo(30, 5);
  });
});

describe("CircularSmoother", () => {
  test("first sample is returned as-is", () => {
    const s = new CircularSmoother(0.15);
    expect(s.update(123).heading).toBeCloseTo(123, 5);
  });

  test("converges to a constant input with high confidence", () => {
    const s = new CircularSmoother(0.15);
    let out = { heading: 0, confidence: 0 };
    for (let i = 0; i < 200; i++) out = s.update(90);
    expect(out.heading).toBeCloseTo(90, 1);
    expect(out.confidence).toBeGreaterThan(0.99);
  });

  test("smooths across the 359→1 wraparound to ~0, not 180", () => {
    const s = new CircularSmoother(0.15);
    let out = { heading: 0, confidence: 0 };
    for (let i = 0; i < 200; i++) out = s.update(i % 2 === 0 ? 359 : 1);
    const deltaToZero = Math.abs(((out.heading + 180) % 360) - 180);
    expect(deltaToZero).toBeLessThan(2);
    expect(out.confidence).toBeGreaterThan(0.9);
  });

  test("wild noise collapses confidence", () => {
    const s = new CircularSmoother(0.15);
    let out = { heading: 0, confidence: 1 };
    for (let i = 0; i < 200; i++) out = s.update(i % 2 === 0 ? 0 : 180);
    expect(out.confidence).toBeLessThan(0.5);
  });
});

describe("nextCumulativeRotation", () => {
  test("moves the short way across 360", () => {
    expect(nextCumulativeRotation(350, 10)).toBe(370);
    expect(nextCumulativeRotation(370, 350)).toBe(350);
  });
  test("never steps more than 180°", () => {
    expect(Math.abs(nextCumulativeRotation(0, 181) - 0)).toBeLessThanOrEqual(180);
    expect(nextCumulativeRotation(0, 181)).toBe(-179);
  });
  test("sequence 358→2→6 has no full spin", () => {
    let c = nextCumulativeRotation(0, 358);
    expect(c).toBeCloseTo(-2, 5); // short way backwards, not +358
    c = nextCumulativeRotation(c, 2);
    c = nextCumulativeRotation(c, 6);
    expect(c).toBeCloseTo(6, 5); // small forward steps through 0, no full spin
  });
});
