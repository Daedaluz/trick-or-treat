import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Door } from "../api";
import type { LatLng } from "../App";

const pumpkinIcon = (mine: boolean, active: boolean) =>
  L.divIcon({
    className: `pumpkin ${mine ? "mine" : ""} ${active ? "active" : ""}`,
    html: "🎃",
    iconSize: [32, 32],
    iconAnchor: [16, 28],
    popupAnchor: [0, -24],
  });

const draftIcon = L.divIcon({
  className: "pumpkin draft",
  html: "📍",
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

interface Props {
  doors: Door[];
  me: LatLng | null;
  myIds: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  draft: LatLng | null;
  onDraftMove?: (p: LatLng) => void;
  flyTo: { target: LatLng; zoom?: number; n: number } | null;
}

// Default view: somewhere sensible before we know where the user is.
const DEFAULT_CENTER: LatLng = { lat: 59.33, lng: 18.07 };

export default function MapView(props: Props) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} zoomControl={false} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Controller {...props} />
      {props.me && (
        <CircleMarker
          center={props.me}
          radius={8}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }}
        />
      )}
      {props.doors.map((d) => (
        <Marker
          key={d.id}
          position={d}
          icon={pumpkinIcon(props.myIds.has(d.id), props.selected === d.id)}
          eventHandlers={{ click: () => props.onSelect(d.id) }}
        >
          <Popup>
            <strong>{d.address}</strong>
            {(d.open_from || d.open_to) && (
              <div>
                Open {d.open_from || "…"} – {d.open_to || "…"}
              </div>
            )}
            {d.note && <div className="note">{d.note}</div>}
          </Popup>
        </Marker>
      ))}
      {props.draft && props.onDraftMove && (
        <Marker
          position={props.draft}
          icon={draftIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              props.onDraftMove!({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

/** Imperative bits: fly-to requests, click-to-place in add mode, popup open on select. */
function Controller({ flyTo, onDraftMove, selected, onSelect }: Props) {
  const map = useMap();

  // Leaflet measures its container once; keep it honest when the pane/sheet resizes.
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 100);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [map]);

  useEffect(() => {
    if (flyTo) map.flyTo(flyTo.target, flyTo.zoom ?? map.getZoom(), { duration: 0.8 });
  }, [flyTo, map]);

  useMapEvents({
    click: (e) => {
      if (onDraftMove) onDraftMove({ lat: e.latlng.lat, lng: e.latlng.lng });
      else if (selected) onSelect(null);
    },
  });

  useEffect(() => {
    if (!selected) return;
    // Open the popup of the selected marker, if it is on the map.
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer.getElement()?.classList.contains("active")) {
        layer.openPopup();
      }
    });
  }, [selected, map]);

  return null;
}
