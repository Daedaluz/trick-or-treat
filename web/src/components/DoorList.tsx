import { distanceM, doorLabel, formatDistance, hoursLabel, type Door } from "../api";
import type { LatLng } from "../App";

interface Props {
  doors: Door[];
  me: LatLng | null;
  myIds: Set<string>;
  visited: Set<string>;
  selected: string | null;
  onFocus: (d: Door) => void;
  onRemove: (id: string) => void;
  onToggleVisited: (id: string) => void;
}

export default function DoorList({ doors, me, myIds, visited, selected, onFocus, onRemove, onToggleVisited }: Props) {
  if (doors.length === 0) {
    return <p className="muted empty">No doors yet. Be the first on your street!</p>;
  }
  return (
    <ul className="door-list">
      {doors.map((d) => {
        const mine = myIds.has(d.id);
        const done = visited.has(d.id);
        return (
          <li key={d.id} className={`${selected === d.id ? "active" : ""} ${mine ? "mine" : ""} ${done ? "visited" : ""}`}>
            <button
              type="button"
              className={`check ${done ? "on" : ""}`}
              onClick={() => onToggleVisited(d.id)}
              aria-pressed={done}
              aria-label={done ? "Mark as not visited" : "Mark as visited"}
              title={done ? "Visited" : "Mark as visited"}
            >
              {done ? "✓" : ""}
            </button>
            <button type="button" className="door" onClick={() => onFocus(d)}>
              <span className="body">
                <span className="addr">{doorLabel(d)}</span>
                <span className="meta">
                  {me && <span>{formatDistance(distanceM(me, d))}</span>}
                  {hoursLabel(d) && <span>{hoursLabel(d)}</span>}
                  {mine && <span className="tag">yours</span>}
                </span>
                {d.intercom_name && <span className="intercom">🔔 Buzz “{d.intercom_name}”</span>}
                {d.note && <span className="note">{d.note}</span>}
              </span>
            </button>
            {mine && (
              <button type="button" className="link danger" onClick={() => onRemove(d.id)}>
                Remove
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
