import { useEffect, useRef } from "react";
import { SHAKE_EVENT, gravity } from "../shake";

interface Props {
  /** Where the spider starts, in viewport pixels (centre of the body). */
  start: { x: number; y: number };
  dir: 1 | -1;
  onDone: () => void;
}

const SIZE = 30; // px, roughly the emoji's box
const G = 2200; // px/s² at full tilt
const RESTITUTION = 0.45;
const FRICTION = 0.985; // per frame while sliding
const DAZED_MS = 4500; // how long it lies there before pulling itself together
const MAX_MS = 30000; // safety net: never linger longer than this, tilt play or not

/**
 * A spider whose thread just snapped. Simple rigid-ish body: gravity follows
 * the phone's tilt, it bounces off the viewport edges, rolls while moving,
 * sits dazed when it comes to rest, and after a while shakes it off and
 * runs away. Another shake kicks it.
 */
export default function FallenSpider({ start, dir, onDone }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const dazed = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current!;
    const face = dazed.current!;
    let x = start.x;
    let y = start.y;
    let vx = (Math.random() - 0.5) * 200;
    let vy = 0;
    let angle = 0; // degrees
    let omega = (Math.random() - 0.5) * 900; // deg/s
    let still = 0; // seconds spent lying still
    let recovering = false;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const kick = () => {
      vx += (Math.random() - 0.5) * 1600;
      vy -= 600 + Math.random() * 500;
      omega += (Math.random() - 0.5) * 1500;
      still = 0;
    };
    window.addEventListener(SHAKE_EVENT, kick);

    const recover = () => {
      recovering = true;
      // Flip upright (relative to gravity) and run for the nearest exit.
      const up = (Math.atan2(-gravity.x, gravity.y) * 180) / Math.PI;
      node.style.transition = "transform .35s ease-out";
      node.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px) rotate(${up}deg)`;
      face.style.opacity = "0";
      window.setTimeout(() => {
        node.style.transition = "transform 1.4s ease-in";
        const exitX = dir > 0 ? window.innerWidth + 60 : -60;
        node.style.transform = `translate(${exitX}px, ${y - SIZE / 2}px) rotate(${up}deg)`;
        window.setTimeout(onDone, 1500);
      }, 400);
    };

    const dbg = window as unknown as { __totFallen?: () => unknown };
    dbg.__totFallen = () => ({ x, y, vx, vy, angle, omega, still, recovering, g: { ...gravity } });

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (recovering) return;

      const W = window.innerWidth;
      const H = window.innerHeight;
      const r = SIZE / 2;

      vx += gravity.x * G * dt;
      vy += gravity.y * G * dt;
      x += vx * dt;
      y += vy * dt;

      // Walls: a hard hit bounces, a gentle one just rests against the surface
      // (otherwise gravity keeps re-launching it a few pixels every frame).
      const SETTLE = 90; // px/s
      let touching = false;
      const hit = (normalV: number) => (Math.abs(normalV) < SETTLE ? 0 : -normalV * RESTITUTION);
      if (y > H - r) { y = H - r; vy = hit(Math.max(vy, 0)); vx *= FRICTION; touching = true; }
      if (y < r)     { y = r;     vy = hit(Math.min(vy, 0)); vx *= FRICTION; touching = true; }
      if (x > W - r) { x = W - r; vx = hit(Math.max(vx, 0)); vy *= FRICTION; touching = true; }
      if (x < r)     { x = r;     vx = hit(Math.min(vx, 0)); vy *= FRICTION; touching = true; }

      const speed = Math.hypot(vx, vy);
      if (touching) {
        // Roll along the surface: angular speed from linear speed.
        omega = ((vx - vy) / r) * (180 / Math.PI) * 0.6;
        if (speed < 30) {
          vx = 0; vy = 0; omega = 0;
          // Settle upright relative to gravity (feet toward the surface), so
          // the dazed face above it stays visible rather than under the floor.
          const upright = (Math.atan2(-gravity.x, gravity.y) * 180) / Math.PI;
          angle += (((upright - angle + 540) % 360) - 180) * 0.25;
          still += dt;
        } else {
          still = 0;
        }
      } else {
        omega *= 0.995;
        still = 0;
      }
      angle += omega * dt;

      node.style.transform = `translate(${x - r}px, ${y - r}px) rotate(${angle}deg)`;
      face.style.opacity = still > 0.3 ? "1" : "0";

      if (still * 1000 > DAZED_MS || now - t0 > MAX_MS) {
        recover();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(SHAKE_EVENT, kick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={el} className="spider fallen" aria-hidden="true" style={{ transform: `translate(${start.x - SIZE / 2}px, ${start.y - SIZE / 2}px)` }}>
      <div className="body">
        <span className="legs fast">🕷️</span>
        <span ref={dazed} className="dazed">😵</span>
      </div>
    </div>
  );
}
