"use client";

import { useCallback, useState } from "react";
import { magvar } from "magvar";
import { JERUSALEM, distanceKm, initialBearing } from "./geo";

export type GeolocationStatus = "idle" | "loading" | "ready" | "denied" | "error" | "unsupported";

export interface GeolocationResult {
  status: GeolocationStatus;
  /** True-north bearing from the user to Jerusalem, degrees [0, 360). */
  bearingDeg: number | null;
  /** Magnetic declination at the user's position, east-positive degrees. */
  declinationDeg: number | null;
  distanceKm: number | null;
  request: () => void;
}

export function useGeolocation(): GeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  const [declinationDeg, setDeclinationDeg] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords;
        setBearingDeg(initialBearing(latitude, longitude, JERUSALEM.lat, JERUSALEM.lon));
        setDeclinationDeg(magvar(latitude, longitude));
        setDistance(distanceKm(latitude, longitude, JERUSALEM.lat, JERUSALEM.lon));
        setStatus("ready");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }, []);

  return { status, bearingDeg, declinationDeg, distanceKm: distance, request };
}
