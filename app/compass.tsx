"use client";

import { useEffect, useRef, useState } from "react";
import { shortestDelta } from "@/lib/geo";
import { useCompassHeading } from "@/lib/useCompassHeading";
import { useGeolocation } from "@/lib/useGeolocation";

const ALIGN_ENTER_DEG = 5;
const ALIGN_EXIT_DEG = 8;

const CARDINALS = [
  { label: "N", angle: 0, className: "fill-red-400" },
  { label: "E", angle: 90, className: "fill-neutral-300" },
  { label: "S", angle: 180, className: "fill-neutral-300" },
  { label: "W", angle: 270, className: "fill-neutral-300" },
];

function CompassCard({
  rotationDeg,
  bearingDeg,
  aligned,
  animate,
}: {
  rotationDeg: number;
  bearingDeg: number | null;
  aligned: boolean;
  animate: boolean;
}) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      className={`h-full w-full ${animate ? "transition-transform duration-150 ease-linear" : ""}`}
      style={{ transform: `rotate(${rotationDeg}deg)` }}
      aria-hidden
    >
      <circle
        r="90"
        className={`fill-none stroke-2 ${aligned ? "stroke-emerald-500" : "stroke-neutral-700"}`}
      />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
        <line
          key={a}
          x1="0"
          y1="-90"
          x2="0"
          y2={a % 90 === 0 ? "-80" : "-84"}
          transform={`rotate(${a})`}
          className={a % 90 === 0 ? "stroke-neutral-400 stroke-2" : "stroke-neutral-600"}
        />
      ))}
      {CARDINALS.map(({ label, angle, className }) => (
        <text
          key={label}
          transform={`rotate(${angle}) translate(0 -62) rotate(${-angle})`}
          textAnchor="middle"
          dominantBaseline="central"
          className={`${className} text-[20px] font-semibold`}
        >
          {label}
        </text>
      ))}
      {bearingDeg !== null && (
        <g transform={`rotate(${bearingDeg})`}>
          <path
            d="M 0 -89 L -7 -72 L 7 -72 Z"
            className={
              aligned
                ? "fill-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                : "fill-amber-400"
            }
          />
          <text
            y="-46"
            textAnchor="middle"
            dominantBaseline="central"
            className={
              aligned
                ? "fill-emerald-400 text-[23px] drop-shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                : "fill-amber-400 text-[18px]"
            }
          >
            ✡
          </text>
        </g>
      )}
    </svg>
  );
}

type StartPhase = "checking" | "gate" | "running";

export default function Compass() {
  const geo = useGeolocation();
  const compass = useCompassHeading(geo.declinationDeg);
  const [phase, setPhase] = useState<StartPhase>("checking");
  const [aligned, setAligned] = useState(false);
  // Chrome only allows navigator.vibrate() after the page has been tapped at
  // least once ("sticky user activation") — auto-start skips the tap, so we
  // track it and hint until vibration is unlocked.
  const [interacted, setInteracted] = useState(
    () => typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === true,
  );
  const wasAlignedRef = useRef(false);

  useEffect(() => {
    if (interacted) return;
    const onDown = () => setInteracted(true);
    window.addEventListener("pointerdown", onDown, { once: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [interacted]);

  const heading = compass.heading;
  const bearing = geo.bearingDeg;

  const delta = heading !== null && bearing !== null ? shortestDelta(heading, bearing) : null;

  // Hysteresis, adjusted during render (React's "adjust state when props change" pattern)
  if (delta !== null) {
    const abs = Math.abs(delta);
    if (!aligned && abs <= ALIGN_ENTER_DEG) setAligned(true);
    else if (aligned && abs > ALIGN_EXIT_DEG) setAligned(false);
  }

  useEffect(() => {
    if (aligned && !wasAlignedRef.current && "vibrate" in navigator) {
      navigator.vibrate?.(50);
    }
    wasAlignedRef.current = aligned;
  }, [aligned]);

  const { request: requestLocation } = geo;

  // Decide the entry screen before showing anything, so the gate never
  // flashes on platforms that can auto-start. iOS always needs the tap
  // (its sensor permission is gesture-gated); Android and desktop can skip
  // the gate when location was already granted.
  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      const requester = window.DeviceOrientationEvent as unknown as
        | { requestPermission?: unknown }
        | undefined;
      if (typeof requester?.requestPermission !== "function") {
        try {
          const p = await navigator.permissions?.query({ name: "geolocation" });
          if (!cancelled && p?.state === "granted") {
            setPhase("running");
            requestLocation();
            return;
          }
        } catch {
          // fall through to the gate
        }
      } else {
        await Promise.resolve(); // keep state updates out of the sync effect body
      }
      if (!cancelled) setPhase("gate");
    };
    void decide();
    return () => {
      cancelled = true;
    };
  }, [requestLocation]);

  const begin = () => {
    setPhase("running");
    void compass.start();
    requestLocation();
  };

  // ——— Blank dark screen for the few ms while the entry screen is decided ———
  if (phase === "checking") {
    return <Shell />;
  }

  // ——— Gate: wait for the tap so both permission prompts come from one gesture ———
  if (phase === "gate") {
    return (
      <Shell>
        <h1 className="text-3xl font-semibold tracking-tight">Where is Jerusalem</h1>
        <p className="max-w-xs text-center text-neutral-400">
          Uses your compass and location to point you toward Jerusalem for prayer.
        </p>
        <button
          onClick={begin}
          className="h-14 rounded-full bg-amber-500 px-10 text-lg font-semibold text-neutral-950 active:scale-95"
        >
          Enable Compass
        </button>
      </Shell>
    );
  }

  // ——— Errors ———
  if (compass.status === "denied") {
    return (
      <ErrorCard
        title="Compass access denied"
        body="The app needs motion & orientation access to show your heading. Re-open the page (or allow Motion & Orientation in Settings → Safari) and tap Enable Compass again."
        onRetry={() => location.reload()}
      />
    );
  }
  if (geo.status === "denied" || geo.status === "error" || geo.status === "unsupported") {
    return (
      <ErrorCard
        title="Location unavailable"
        body="Location is needed to compute the direction of Jerusalem from where you are. If you denied it on iOS, re-enable it in Settings before retrying."
        onRetry={geo.request}
      />
    );
  }

  // ——— Desktop / no sensors ———
  if (compass.status === "unsupported") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Where is Jerusalem</h1>
        <div className="relative aspect-square w-[min(85vw,55dvh,22rem)]">
          <CompassCard rotationDeg={0} bearingDeg={bearing} aligned={false} animate={false} />
        </div>
        <p className="max-w-sm text-center text-neutral-400">
          {bearing !== null
            ? `Live compass needs a phone with motion sensors. From your location, Jerusalem is at ${Math.round(bearing)}°.`
            : "Live compass needs a phone with motion sensors. Waiting for your location…"}
        </p>
      </Shell>
    );
  }

  // ——— Active compass ———
  const hint = compass.needsCalibration
    ? "Compass needs calibration — wave your phone in a figure-8"
    : compass.tiltTooHigh
      ? "Hold your phone flat"
      : compass.provisional
        ? "Waiting for location to fine-tune north…"
        : !interacted && typeof navigator !== "undefined" && "vibrate" in navigator
          ? "Tap the screen once to enable vibration"
          : null;

  return (
    <Shell>
      <div className="relative aspect-square w-[min(85vw,55dvh,22rem)]">
        {/* Fixed lubber line: your heading, always at 12 o'clock */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-sky-400">
          <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
            <path d="M 11 14 L 0 0 L 22 0 Z" fill="currentColor" />
          </svg>
        </div>
        <CompassCard
          rotationDeg={compass.rotationDeg}
          bearingDeg={bearing}
          aligned={aligned}
          animate
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-4xl font-semibold tabular-nums">
            {heading !== null ? `${Math.round(heading)}°` : "—"}
          </span>
          <span className={`text-sm ${aligned ? "text-emerald-400" : "text-neutral-400"}`}>
            {aligned
              ? "Facing Jerusalem"
              : delta !== null
                ? `Turn ${delta > 0 ? "right" : "left"} ${Math.round(Math.abs(delta))}°`
                : heading === null
                  ? "Reading compass…"
                  : "Waiting for location…"}
          </span>
        </div>
      </div>
      <div className="flex h-10 items-center">
        {hint && <p className="text-center text-sm text-amber-300">{hint}</p>}
      </div>
      {bearing !== null && geo.distanceKm !== null && (
        <p className="text-sm text-neutral-500">
          Jerusalem: {Math.round(bearing)}° · {Math.round(geo.distanceKm).toLocaleString("en-US")} km
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex h-dvh touch-none select-none flex-col items-center justify-center gap-5 overflow-hidden bg-neutral-950 p-6 text-neutral-100">
      {children}
    </main>
  );
}

function ErrorCard({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry: () => void;
}) {
  return (
    <Shell>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm text-center text-neutral-400">{body}</p>
      <button
        onClick={onRetry}
        className="h-12 rounded-full bg-neutral-800 px-8 font-medium text-neutral-100 active:scale-95"
      >
        Retry
      </button>
    </Shell>
  );
}
