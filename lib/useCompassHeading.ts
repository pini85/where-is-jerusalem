"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyDeclination } from "./geo";
import { CircularSmoother, magneticHeading, nextCumulativeRotation, tiltAngle } from "./orientation";

export type CompassStatus =
  | "idle" // listeners attached, waiting for the first event (Android)
  | "needs-permission" // iOS: must call start() from a user gesture
  | "active"
  | "denied"
  | "unsupported";

export interface CompassHeadingResult {
  status: CompassStatus;
  /**
   * Smoothed heading in degrees clockwise from TRUE north, or null before the
   * first reading. On Android this is magnetic + declination; until the
   * declination is known it is magnetic-only and `provisional` is true.
   */
  heading: number | null;
  /** Unbounded cumulative rotation (−heading) that always animates the short way. */
  rotationDeg: number;
  /** Heading lacks the declination correction (Android before geolocation). */
  provisional: boolean;
  needsCalibration: boolean;
  tiltTooHigh: boolean;
  /** Call from a user tap. Requests iOS sensor permission when required. */
  start: () => Promise<void>;
}

interface WebkitOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionRequester {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const SMOOTHING_K = 0.15;
const FLUSH_MS = 66;
const TILT_LIMIT_DEG = 40;
const LOW_CONFIDENCE = 0.9;
const LOW_CONFIDENCE_SUSTAIN_MS = 1500;
const FIRST_EVENT_TIMEOUT_MS = 3000;

function detectInitialStatus(): CompassStatus {
  if (typeof window === "undefined") return "idle"; // prerender placeholder
  if (typeof window.DeviceOrientationEvent === "undefined") return "unsupported";
  const requester = window.DeviceOrientationEvent as unknown as PermissionRequester;
  return typeof requester.requestPermission === "function" ? "needs-permission" : "idle";
}

export function useCompassHeading(declinationDeg: number | null): CompassHeadingResult {
  const [status, setStatus] = useState<CompassStatus>(detectInitialStatus);
  const [heading, setHeading] = useState<number | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [provisional, setProvisional] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [tiltTooHigh, setTiltTooHigh] = useState(false);

  const declinationRef = useRef<number | null>(null);
  useEffect(() => {
    declinationRef.current = declinationDeg;
  }, [declinationDeg]);

  const smootherRef = useRef<CircularSmoother | null>(null);
  const rotationRef = useRef(0);
  const lastFlushRef = useRef(0);
  const lowConfidenceSinceRef = useRef<number | null>(null);
  const gotEventRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);

  const handleEvent = useCallback((event: WebkitOrientationEvent) => {
    let magnetic: number | null = null;
    let isTrueNorth = false;
    let calibrationFromAccuracy: boolean | null = null;

    if (typeof event.webkitCompassHeading === "number" && event.webkitCompassHeading >= 0) {
      // iOS: already true north, clockwise, sensor-fused by the OS
      magnetic = event.webkitCompassHeading;
      isTrueNorth = true;
      const acc = event.webkitCompassAccuracy;
      if (typeof acc === "number") calibrationFromAccuracy = acc < 0 || acc > 10;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      // Android: only trust compass-referenced (absolute) readings in production
      const devFallback = process.env.NODE_ENV === "development";
      if (!event.absolute && !devFallback) return;
      const screenAngle =
        typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
      magnetic = magneticHeading(event.alpha, event.beta ?? 0, event.gamma ?? 0, screenAngle);
    }

    if (magnetic === null) return;
    gotEventRef.current = true;

    smootherRef.current ??= new CircularSmoother(SMOOTHING_K);
    const { heading: smoothed, confidence } = smootherRef.current.update(magnetic);

    const now = performance.now();
    let calibration = calibrationFromAccuracy ?? false;
    if (calibrationFromAccuracy === null) {
      // Android has no accuracy field: flag sustained high variance instead
      if (confidence < LOW_CONFIDENCE) {
        lowConfidenceSinceRef.current ??= now;
        calibration = now - lowConfidenceSinceRef.current > LOW_CONFIDENCE_SUSTAIN_MS;
      } else {
        lowConfidenceSinceRef.current = null;
      }
    }

    if (now - lastFlushRef.current < FLUSH_MS) return;
    lastFlushRef.current = now;

    const declination = declinationRef.current;
    const trueHeading = isTrueNorth ? smoothed : applyDeclination(smoothed, declination ?? 0);
    rotationRef.current = nextCumulativeRotation(rotationRef.current, -trueHeading);

    setStatus((s) => (s === "active" ? s : "active"));
    setHeading(Math.round(trueHeading * 2) / 2);
    setRotationDeg(rotationRef.current);
    setProvisional(!isTrueNorth && declination === null);
    setNeedsCalibration(calibration);
    setTiltTooHigh(tiltAngle(event.beta ?? 0, event.gamma ?? 0) > TILT_LIMIT_DEG);
  }, []);

  const attach = useCallback(() => {
    const useAbsolute =
      "ondeviceorientationabsolute" in window && process.env.NODE_ENV !== "development";
    const eventName = useAbsolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(eventName, handleEvent as EventListener);
    const timeout = window.setTimeout(() => {
      if (!gotEventRef.current) setStatus("unsupported");
    }, FIRST_EVENT_TIMEOUT_MS);
    detachRef.current = () => {
      window.removeEventListener(eventName, handleEvent as EventListener);
      window.clearTimeout(timeout);
    };
  }, [handleEvent]);

  useEffect(() => {
    // iOS attaches in start() after the permission grant; Android attaches now
    if (detectInitialStatus() === "idle") attach();
    return () => detachRef.current?.();
  }, [attach]);

  const start = useCallback(async () => {
    const requester = window.DeviceOrientationEvent as unknown as PermissionRequester;
    if (typeof requester.requestPermission !== "function") return;
    try {
      const result = await requester.requestPermission();
      if (result === "granted") {
        attach();
      } else {
        setStatus("denied");
      }
    } catch {
      setStatus("denied");
    }
  }, [attach]);

  return { status, heading, rotationDeg, provisional, needsCalibration, tiltTooHigh, start };
}
