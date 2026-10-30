export interface Door {
  id: string;
  lat: number;
  lng: number;
  address: string;
  unit?: string;
  intercom_name?: string;
  note?: string;
  open_from?: string;
  open_to?: string;
  year: number;
  created_at: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}

export interface NewDoor {
  lat: number;
  lng: number;
  address: string;
  unit: string;
  intercom_name: string;
  note: string;
  open_from: string;
  open_to: string;
}

/** Doors standing at (practically) the same spot: one building, several households. */
export interface Building {
  key: string;
  lat: number;
  lng: number;
  address: string;
  doors: Door[];
}

export function groupByBuilding(doors: Door[]): Building[] {
  const map = new Map<string, Building>();
  for (const d of doors) {
    // ~1 m precision; geocoded addresses land on identical coordinates anyway.
    const key = `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`;
    let b = map.get(key);
    if (!b) {
      b = { key, lat: d.lat, lng: d.lng, address: d.address, doors: [] };
      map.set(key, b);
    }
    b.doors.push(d);
  }
  for (const b of map.values()) b.doors.sort((a, c) => (a.unit ?? "").localeCompare(c.unit ?? "", undefined, { numeric: true }));
  return [...map.values()];
}

export function doorLabel(d: Door): string {
  return d.unit ? `${d.address} · ${d.unit}` : d.address;
}

export function hoursLabel(d: Door): string | null {
  if (!d.open_from && !d.open_to) return null;
  return `${d.open_from || "…"}–${d.open_to || "…"}`;
}

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SeasonState {
  year: number;
  phase: "before" | "open" | "after";
  signup_open: boolean;
  signup_opens_at: string;
  event_at: string;
  archive_at: string;
  reason?: string;
  last_season?: { year: number; doors: number };
}

export const api = {
  season: () => fetch("/api/season").then((r) => check<SeasonState>(r)),

  listDoors: () => fetch("/api/doors").then((r) => check<Door[]>(r)),

  createDoor: (d: NewDoor) =>
    fetch("/api/doors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    }).then((r) => check<{ door: Door; token: string }>(r)),

  updateDoor: (id: string, token: string, d: NewDoor) =>
    fetch(`/api/doors/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Door-Token": token },
      body: JSON.stringify(d),
    }).then((r) => check<Door>(r)),

  deleteDoor: (id: string, token: string) =>
    fetch(`/api/doors/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Door-Token": token },
    }).then((r) => check<void>(r)),

  sendFeedback: (f: { message: string; contact: string }) =>
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((r) => check<void>(r)),

  geocode: (q: string) =>
    fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => check<GeocodeResult[]>(r)),
};

/** Doors this browser registered, with the secret tokens needed to remove them. */
const KEY = "trick-or-treat:my-doors";

export interface MyDoor {
  id: string;
  token: string;
}

export function loadMyDoors(): MyDoor[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as MyDoor[];
  } catch {
    return [];
  }
}

export function saveMyDoors(doors: MyDoor[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doors));
  } catch {
    /* private mode etc. */
  }
}

/** Doors this browser has already knocked on, per season year. */
const VISITED_KEY = (year: number) => `trick-or-treat:visited:${year}`;

export function loadVisited(year: number): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(VISITED_KEY(year)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveVisited(year: number, ids: Set<string>) {
  try {
    localStorage.setItem(VISITED_KEY(year), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
