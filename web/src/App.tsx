import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  distanceM,
  loadMyDoors,
  loadVisited,
  saveMyDoors,
  saveVisited,
  type Door,
  type MyDoor,
  type NewDoor,
  type SeasonState,
} from "./api";
import MapView, { inBounds, type Basemap, type Bounds } from "./components/MapView";
import AddDoorPanel from "./components/AddDoorPanel";
import DoorList from "./components/DoorList";
import FeedbackPanel from "./components/FeedbackPanel";
import OffSeasonPanel from "./components/OffSeasonPanel";
import Spider from "./components/Spider";

export type LatLng = { lat: number; lng: number };
type Mode = "browse" | "add" | "feedback";

export default function App() {
  const [doors, setDoors] = useState<Door[]>([]);
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => loadVisited(new Date().getFullYear()));
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [myDoors, setMyDoors] = useState<MyDoor[]>(() => loadMyDoors());
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<Mode>("browse");
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [editing, setEditing] = useState<Door | null>(null);
  const [flyTo, setFlyTo] = useState<{ target: LatLng; zoom?: number; n: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>(() => {
    try {
      return localStorage.getItem("trick-or-treat:basemap") === "streets" ? "streets" : "satellite";
    } catch {
      return "satellite";
    }
  });

  function toggleBasemap() {
    const next: Basemap = basemap === "satellite" ? "streets" : "satellite";
    setBasemap(next);
    try {
      localStorage.setItem("trick-or-treat:basemap", next);
    } catch {
      /* ignore */
    }
  }

  const refresh = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.listDoors(), api.season()]);
      setDoors(d);
      setSeason(s);
      setError(null);
    } catch (e) {
      setError(`Could not load doors: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser does not support geolocation.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        setFlyTo((f) => ({ target: p, zoom: 15, n: (f?.n ?? 0) + 1 }));
        setLocating(false);
      },
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // Ask for location once on load; it is the whole point of the map.
  useEffect(() => {
    locate();
  }, [locate]);

  // The list follows the map: only doors in the visible area, nearest first.
  const sorted = useMemo(() => {
    const visible = bounds ? doors.filter((d) => inBounds(bounds, d)) : doors;
    if (!me) return visible;
    return [...visible].sort((a, b) => distanceM(me, a) - distanceM(me, b));
  }, [doors, me, bounds]);

  const myIds = useMemo(() => new Set(myDoors.map((d) => d.id)), [myDoors]);

  // Visited marks belong to a season; reload them if the server's year differs.
  useEffect(() => {
    if (season) setVisited(loadVisited(season.year));
  }, [season?.year]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleVisited(id: string) {
    const year = season?.year ?? new Date().getFullYear();
    const next = new Set(visited);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisited(next);
    saveVisited(year, next);
  }

  const visitedCount = useMemo(() => doors.filter((d) => visited.has(d.id)).length, [doors, visited]);

  async function submitDoor(d: NewDoor) {
    if (editing) {
      const mine = myDoors.find((m) => m.id === editing.id);
      if (!mine) throw new Error("This browser does not hold the key for that door.");
      const updated = await api.updateDoor(editing.id, mine.token, d);
      setSelected(updated.id);
    } else {
      const res = await api.createDoor(d);
      const next = [...myDoors, { id: res.door.id, token: res.token }];
      setMyDoors(next);
      saveMyDoors(next);
      setSelected(res.door.id);
    }
    setMode("browse");
    setDraft(null);
    setEditing(null);
    await refresh();
  }

  function startEdit(d: Door) {
    setEditing(d);
    setDraft({ lat: d.lat, lng: d.lng });
    setMode("add");
    setSheetOpen(true);
    setFlyTo((f) => ({ target: d, zoom: 17, n: (f?.n ?? 0) + 1 }));
  }

  async function removeDoor(id: string) {
    const mine = myDoors.find((d) => d.id === id);
    if (!mine) return;
    if (!confirm("Remove your door from the map?")) return;
    try {
      await api.deleteDoor(id, mine.token);
    } catch (e) {
      // If it is already gone server-side, forget it locally anyway.
      if ((e as Error).message !== "no door with that id and token") {
        setError(`Could not remove door: ${(e as Error).message}`);
        return;
      }
    }
    const next = myDoors.filter((d) => d.id !== id);
    setMyDoors(next);
    saveMyDoors(next);
    await refresh();
  }

  function focusDoor(d: Door) {
    setSelected(d.id);
    setFlyTo((f) => ({ target: d, zoom: 17, n: (f?.n ?? 0) + 1 }));
    if (window.matchMedia("(max-width: 720px)").matches) setSheetOpen(false);
  }

  function startAdd() {
    setEditing(null);
    setMode("add");
    setSheetOpen(true);
    setDraft(me ?? null);
  }

  return (
    <div className="app">
      <MapView
        basemap={basemap}
        doors={doors}
        me={me}
        myIds={myIds}
        visited={visited}
        selected={selected}
        onSelect={setSelected}
        draft={mode === "add" ? draft : null}
        onDraftMove={mode === "add" ? setDraft : undefined}
        flyTo={flyTo}
        onBoundsChange={setBounds}
      />

      <Spider />

      <header className="topbar">
        <h1>
          <img src="/icons/ghost.svg" alt="" width="28" height="28" /> Trick or Treat
        </h1>
        <div className="topbar-actions">
          <button
            className="icon-btn"
            onClick={toggleBasemap}
            title={basemap === "satellite" ? "Switch to street map" : "Switch to satellite"}
            aria-label={basemap === "satellite" ? "Switch to street map" : "Switch to satellite"}
          >
            {basemap === "satellite" ? "🗺️" : "🛰️"}
          </button>
          <button className="icon-btn" onClick={locate} disabled={locating} title="Find me" aria-label="Find me">
            {locating ? "…" : "◎"}
          </button>
        </div>
      </header>

      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <aside className={`sheet ${sheetOpen ? "open" : "closed"}`}>
        <button className="sheet-handle" onClick={() => setSheetOpen((o) => !o)} aria-label="Toggle panel" />
        {mode === "feedback" ? (
          <FeedbackPanel onClose={() => setMode("browse")} />
        ) : season && season.phase !== "open" ? (
          <>
            <OffSeasonPanel season={season} />
            <footer className="sheet-foot">
              <button type="button" className="link" onClick={() => setMode("feedback")}>
                💬 Leave feedback
              </button>
            </footer>
          </>
        ) : mode === "add" ? (
          <AddDoorPanel
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            draft={draft}
            onDraftChange={(p) => {
              setDraft(p);
              setFlyTo((f) => ({ target: p, zoom: 17, n: (f?.n ?? 0) + 1 }));
            }}
            onSubmit={submitDoor}
            onCancel={() => {
              setMode("browse");
              setDraft(null);
              setEditing(null);
            }}
          />
        ) : (
          <>
            <div className="sheet-head">
              <div>
                <strong>{sorted.length}</strong> {sorted.length === 1 ? "door" : "doors"} in view
                <div className="muted">
                  {doors.length} open {season ? `in ${season.year}` : "this year"}
                  {visitedCount > 0 && ` · ${visitedCount} visited`}
                  {!me && " · tap ◎ to sort by distance"}
                </div>
              </div>
              {season?.signup_open !== false && (
                <button className="primary" onClick={startAdd}>
                  + Add my door
                </button>
              )}
            </div>
            {season && !season.signup_open && <p className="closed">{season.reason}</p>}
            <DoorList
              doors={sorted}
              total={doors.length}
              me={me}
              myIds={myIds}
              visited={visited}
              selected={selected}
              onFocus={focusDoor}
              onEdit={startEdit}
              onRemove={removeDoor}
              onToggleVisited={toggleVisited}
            />
            <footer className="sheet-foot">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode("feedback");
                  setSheetOpen(true);
                }}
              >
                💬 Leave feedback
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
