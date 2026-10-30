import { useEffect, useState } from "react";
import type { SeasonState } from "../api";

interface Props {
  season: SeasonState;
}

/** Shown between the archive date and the next sign-up date. */
export default function OffSeasonPanel({ season }: Props) {
  const event = new Date(season.event_at);
  const signup = new Date(season.signup_opens_at);
  const eventYear = event.getFullYear();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = Math.max(0, Math.ceil((event.getTime() - now.getTime()) / 86_400_000));
  const signupDays = Math.max(0, Math.ceil((signup.getTime() - now.getTime()) / 86_400_000));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="offseason">
      <div className="ghost" aria-hidden="true">
        👻
      </div>
      {season.phase === "after" ? (
        <h2>That's a wrap on {season.last_season?.year ?? eventYear - 1}!</h2>
      ) : (
        <h2>Halloween {eventYear} is coming</h2>
      )}

      {season.last_season && (
        <p className="stat">
          <strong>{season.last_season.doors}</strong> {season.last_season.doors === 1 ? "door" : "doors"} welcomed
          trick-or-treaters in {season.last_season.year}. Thank you! 🎃
        </p>
      )}

      <div className="countdown">
        <div>
          <strong>{days}</strong>
          <span>{days === 1 ? "day" : "days"} until Halloween {eventYear}</span>
        </div>
        <div>
          <strong>{signupDays}</strong>
          <span>{signupDays === 1 ? "day" : "days"} until sign-up opens</span>
        </div>
      </div>

      <p className="muted small">
        Households can put their door on the map from {fmt(signup)}. Add this page to your home screen so it's ready
        when the pumpkins come out.
      </p>
    </div>
  );
}
