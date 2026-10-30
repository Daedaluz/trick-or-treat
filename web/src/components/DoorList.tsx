import { distanceM, doorLabel, formatDistance, hoursLabel, type Door } from "../api";
import type { LatLng } from "../App";

interface Props {
  doors: Door[];
  me: LatLng | null;
  myIds: Set<string>;
  selected: string | null;
  onFocus: (d: Door) => void;
  onRemove: (id: string) => void;
}

export default function DoorList({ doors, me, myIds, selected, onFocus, onRemove }: Props) {
  if (doors.length === 0) {
    return <p className="muted empty">No doors yet. Be the first on your street!</p>;
  }
  return (
    <ul className="door-list">
      {doors.map((d) => {
        const mine = myIds.has(d.id);
        return (
          <li key={d.id} className={`${selected === d.id ? "active" : ""} ${mine ? "mine" : ""}`}>
            <button type="button" className="door" onClick={() => onFocus(d)}>
              <span className="emoji">🎃</span>
              <span className="body">
                <span className="addr">{doorLabel(d)}</span>
                <span className="meta">
                  {me && <span>{formatDistance(distanceM(me, d))}</span>}
                  {hoursLabel(d) && <span>{hoursLabel(d)}</span>}
                  {mine && <span className="tag">yours</span>}
                </span>
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
