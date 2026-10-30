export interface Door {
  id: string;
  lat: number;
  lng: number;
  address: string;
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
  note: string;
  open_from: string;
  open_to: string;
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

export const api = {
  listDoors: () => fetch("/api/doors").then((r) => check<Door[]>(r)),

  createDoor: (d: NewDoor) =>
    fetch("/api/doors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    }).then((r) => check<{ door: Door; token: string }>(r)),

  deleteDoor: (id: string, token: string) =>
    fetch(`/api/doors/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Door-Token": token },
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
