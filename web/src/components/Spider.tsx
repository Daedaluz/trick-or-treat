import { useEffect, useState } from "react";
import { SHAKE_EVENT, motionNeedsPermission, startShakeListener } from "../shake";

type Kind = "visit" | "fall";

interface Run {
  id: number;
  kind: Kind;
  x: number; // percentage of viewport width where the spider appears
  dir: 1 | -1; // which way it scurries off afterwards
  drop: number; // how far down it dangles, in vh
}

const FIRST_DELAY = [25_000, 70_000] as const;
const NEXT_DELAY = [150_000, 420_000] as const;
const VISIT_MS = 9_000;
const FALL_MS = 6_500;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * Easter egg: every few minutes a spider drops down on a thread, has a look
 * around, and scurries off the edge of the screen. Shake the phone (or
 * triple-tap the ghost) and the thread snaps: it plummets, lands on its back,
 * lies there dazed for a moment, then flips over and runs for it.
 * Purely decorative, never blocks taps, stays home under reduced motion.
 */
export default function Spider() {
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number;
    let hide: number | undefined;
    let id = 0;

    const start = (kind: Kind, x?: number) => {
      window.clearTimeout(hide);
      setRun({ id: ++id, kind, x: x ?? rand(15, 85), dir: Math.random() < 0.5 ? -1 : 1, drop: rand(18, 42) });
      hide = window.setTimeout(() => setRun(null), kind === "fall" ? FALL_MS : VISIT_MS);
    };

    const schedule = (range: readonly [number, number]) => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") start("visit");
        schedule(NEXT_DELAY);
      }, rand(range[0], range[1]));
    };
    schedule(FIRST_DELAY);

    // A shake knocks the current spider down, or summons a startled one.
    const onShake = () => {
      const current = (window as unknown as { __totSpider?: Run | null }).__totSpider;
      start("fall", current?.kind === "visit" ? current.x : undefined);
    };
    window.addEventListener(SHAKE_EVENT, onShake);
    // Listen for motion right away where no permission prompt is needed;
    // iOS wires the listener from a tap on the header ghost instead.
    if (!motionNeedsPermission()) startShakeListener();

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hide);
      window.removeEventListener(SHAKE_EVENT, onShake);
    };
  }, []);

  // Keep the shake handler aware of what is on screen without re-binding it.
  useEffect(() => {
    (window as unknown as { __totSpider?: Run | null }).__totSpider = run;
  }, [run]);

  if (!run) return null;
  return (
    <div
      key={run.id}
      className={`spider ${run.kind}`}
      aria-hidden="true"
      style={
        {
          "--x": `${run.x}vw`,
          "--drop": `${run.drop}vh`,
          "--dir": run.dir,
          "--dur": `${run.kind === "fall" ? FALL_MS : VISIT_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="thread" />
      <div className="body">
        <span className="legs">🕷️</span>
        {run.kind === "fall" && <span className="dazed">😵</span>}
      </div>
    </div>
  );
}
