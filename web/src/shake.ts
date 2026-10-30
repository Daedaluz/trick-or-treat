/**
 * Shake detection. Fires the "tot:shake" event on window when the device is
 * shaken. iOS needs an explicit permission request from a user gesture, so
 * callers wire `requestMotionPermission` to a tap; everywhere else listening
 * starts right away.
 */

export const SHAKE_EVENT = "tot:shake";

const THRESHOLD = 18; // m/s², gravity excluded; a brisk shake, not a bus ride
const COOLDOWN_MS = 2500;

let listening = false;

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  // Remove gravity roughly: compare to the previous sample.
  const mag = Math.hypot(a.x - last.x, a.y - last.y, a.z - last.z);
  last = { x: a.x, y: a.y, z: a.z };
  const now = Date.now();
  if (mag > THRESHOLD && now - lastShake > COOLDOWN_MS) {
    lastShake = now;
    window.dispatchEvent(new CustomEvent(SHAKE_EVENT));
  }
}
let last = { x: 0, y: 0, z: 0 };
let lastShake = 0;

type Requestable = { requestPermission?: () => Promise<"granted" | "denied"> };

/** True when this browser needs a user gesture before motion events flow (iOS). */
export function motionNeedsPermission(): boolean {
  return typeof (DeviceMotionEvent as unknown as Requestable)?.requestPermission === "function";
}

export function startShakeListener() {
  if (listening || typeof DeviceMotionEvent === "undefined") return;
  listening = true;
  window.addEventListener("devicemotion", onMotion, { passive: true });
}

/** Call from a click/touch handler. Resolves true when motion events are available. */
export async function requestMotionPermission(): Promise<boolean> {
  if (!motionNeedsPermission()) {
    startShakeListener();
    return true;
  }
  try {
    const res = await (DeviceMotionEvent as unknown as Requestable).requestPermission!();
    if (res === "granted") {
      startShakeListener();
      return true;
    }
  } catch {
    /* user dismissed */
  }
  return false;
}

/** Fire a shake by hand (desktop easter egg, tests). */
export function fakeShake() {
  window.dispatchEvent(new CustomEvent(SHAKE_EVENT));
}
