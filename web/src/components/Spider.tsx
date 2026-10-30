import { useEffect, useState } from "react";

interface Run {
  id: number;
  x: number; // percentage of viewport width where the spider drops
  dir: 1 | -1; // which way it scurries off afterwards
  drop: number; // how far down it drops, in vh
}

const FIRST_DELAY = [25_000, 70_000] as const;
const NEXT_DELAY = [150_000, 420_000] as const;
const DURATION = 9_000;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * Easter egg: every few minutes a spider drops down on a thread, has a look
 * around, and scurries off the edge of the screen. Purely decorative, never
 * blocks taps, and stays home for people who prefer reduced motion.
 */
export default function Spider() {
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number;
    let id = 0;
    const schedule = (range: readonly [number, number]) => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          setRun({ id: ++id, x: rand(15, 85), dir: Math.random() < 0.5 ? -1 : 1, drop: rand(18, 42) });
          window.setTimeout(() => setRun(null), DURATION);
        }
        schedule(NEXT_DELAY);
      }, rand(range[0], range[1]));
    };
    schedule(FIRST_DELAY);
    return () => window.clearTimeout(timer);
  }, []);

  if (!run) return null;
  return (
    <div
      key={run.id}
      className="spider"
      aria-hidden="true"
      style={
        {
          "--x": `${run.x}vw`,
          "--drop": `${run.drop}vh`,
          "--dir": run.dir,
          "--dur": `${DURATION}ms`,
        } as React.CSSProperties
      }
    >
      <div className="thread" />
      <div className="body">🕷️</div>
    </div>
  );
}
