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

/**
 * Gravity direction in screen space, from device orientation. Unit-ish vector:
 * (0, 1) is straight down the screen, (1, 0) toward the right edge. Stays
 * (0, 1) where orientation events are unavailable or would need a prompt.
 */
export const gravity = { x: 0, y: 1 };
// Exposed for debugging/tests in the console; harmless otherwise.
(window as unknown as { __totGravity?: typeof gravity }).__totGravity = gravity;

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  // beta: front/back tilt (-180..180), gamma: left/right (-90..90), in the
  // device's own frame. Project onto the screen, then undo screen rotation.
  const b = (e.beta * Math.PI) / 180;
  const g = (e.gamma * Math.PI) / 180;
  let gx = Math.sin(g) * Math.cos(b);
  let gy = Math.sin(b);
  const angle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
  const rx = gx * Math.cos(angle) + gy * Math.sin(angle);
  const ry = -gx * Math.sin(angle) + gy * Math.cos(angle);
  gx = rx;
  gy = ry;
  // Lying flat gives almost no in-plane gravity; keep a hint of "down" so the
  // spider never hovers in the middle of the screen.
  const mag = Math.hypot(gx, gy);
  if (mag < 0.2) {
    gy += 0.2 - mag;
  }
  gravity.x = gx;
  gravity.y = gy;
}

export function startOrientationListener() {
  if (typeof DeviceOrientationEvent === "undefined") return;
  if (typeof (DeviceOrientationEvent as unknown as Requestable).requestPermission === "function") return; // iOS: would prompt
  window.addEventListener("deviceorientation", onOrientation, { passive: true });
}

/** Fire a shake by hand (desktop easter egg, tests). */
export function fakeShake() {
  window.dispatchEvent(new CustomEvent(SHAKE_EVENT));
}
