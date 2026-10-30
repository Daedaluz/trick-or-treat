import { useEffect, useRef, useState } from "react";
import { api, type GeocodeResult, type NewDoor } from "../api";
import type { LatLng } from "../App";

interface Props {
  draft: LatLng | null;
  onDraftChange: (p: LatLng) => void;
  onSubmit: (d: NewDoor) => Promise<void>;
  onCancel: () => void;
}

export default function AddDoorPanel({ draft, onDraftChange, onSubmit, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [intercom, setIntercom] = useState("");
  const [note, setNote] = useState("");
  const [openFrom, setOpenFrom] = useState("17:00");
  const [openTo, setOpenTo] = useState("20:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Debounced address search.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api.geocode(query));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  function pick(r: GeocodeResult) {
    setAddress(shortName(r.display_name));
    setResults([]);
    setQuery("");
    onDraftChange({ lat: r.lat, lng: r.lng });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) {
      setError("Pick your address or tap the map to place the pin.");
      return;
    }
    if (!address.trim()) {
      setError("Enter the address shown on your door.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ lat: draft.lat, lng: draft.lng, address: address.trim(), unit: unit.trim(), intercom_name: intercom.trim(), note: note.trim(), open_from: openFrom, open_to: openTo });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-panel" onSubmit={submit}>
      <div className="sheet-head">
        <strong>Add my door</strong>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <label>
        Find your address
        <input
          type="search"
          placeholder="Street 12, Town"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      {searching && <div className="muted">Searching…</div>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(r)}>
                <span className="main">{shortName(r.display_name)}</span>
                <span className="rest">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small">
        {draft
          ? "Drag the pin or tap the map to fine-tune where your door is."
          : "Or just tap the map where your door is."}
      </p>

      <label>
        Address shown to visitors
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Pumpkin Lane 13" maxLength={300} required />
        <span className="hint">What is written on the door or the sign.</span>
      </label>

      <label>
        Apartment / floor (optional)
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Apt 1203, 3rd floor"
          maxLength={100}
        />
        <span className="hint">For buildings with several households.</span>
      </label>

      <label>
        Name on the intercom (optional)
        <input
          value={intercom}
          onChange={(e) => setIntercom(e.target.value)}
          placeholder="Andersson"
          maxLength={100}
        />
        <span className="hint">So visitors know who to buzz to get in.</span>
      </label>

      <div className="row">
        <label>
          Open from
          <input type="time" value={openFrom} onChange={(e) => setOpenFrom(e.target.value)} />
        </label>
        <label>
          Until
          <input type="time" value={openTo} onChange={(e) => setOpenTo(e.target.value)} />
        </label>
      </div>

      <label>
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ring the bell, allergy-friendly candy…"
          maxLength={500}
          rows={2}
        />
      </label>

      {error && <div className="error">{error}</div>}

      <button className="primary wide" type="submit" disabled={busy || !draft}>
        {busy ? "Saving…" : "Put my door on the map"}
      </button>
      <p className="muted small">
        Only this browser can remove the door afterwards, so keep it around. Doors reset every year.
      </p>
    </form>
  );
}

/**
 * Nominatim returns long names like "10, Kungsgatan, Norrmalm, …" or
 * "Kallhällsparken Hus 4, 7, Ulvsättragränd, Lilla Ulvsättra, …".
 * Find the house number, join it with the street that follows it, and lead
 * with that; keep a couple of the remaining parts for context.
 */
function shortName(s: string): string {
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((p, idx) => idx + 1 < parts.length && /^\d+[a-zA-Z]?(-\d+[a-zA-Z]?)?$/.test(p));
  if (i >= 0) {
    const street = `${parts[i + 1]} ${parts[i]}`;
    const rest = parts.filter((_, idx) => idx !== i && idx !== i + 1);
    return [street, ...rest.slice(0, 2)].join(", ");
  }
  return parts.slice(0, 3).join(", ");
}
