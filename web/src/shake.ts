/**
 * Shake detection. Fires the "tot:shake" event on window when the device is
 * shaken. iOS would need a permission dialog before motion events flow, and a
 * system prompt is no way to deliver an easter egg, so there we never ask:
 * iPhone users get the same effect by tapping the ghost three times.
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

/** Fire a shake by hand (desktop easter egg, tests). */
export function fakeShake() {
  window.dispatchEvent(new CustomEvent(SHAKE_EVENT));
}
